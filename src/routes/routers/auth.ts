import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { customAlphabet } from "nanoid";

import { prisma } from "../../db/prisma.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { sha256, randomToken } from "../../utils/crypto.js";
import { env } from "../../config/env.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/tokens.js";
import { sendPasswordResetEmail } from "../../utils/email.js";

const limiter = rateLimit({ windowMs: 60_000, limit: 20 });

export const authRouter = Router();

authRouter.use(limiter);

const genReferralCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

async function generateUniqueReferralCode() {
  for (let i = 0; i < 7; i++) {
    const code = genReferralCode();
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique referral code");
}

authRouter.post("/register", async (req, res) => {
  const body = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(7).max(20).optional(),
      password: z.string().min(8),
      confirmPassword: z.string().min(8),
      inviteCode: z.string().min(3).max(32).optional()
    })
    .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" })
    .parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) return res.status(409).json({ message: "Email already in use" });

  const passwordHash = await hashPassword(body.password);

  const referralCode = await generateUniqueReferralCode();

  let referredById: string | undefined;
  if (body.inviteCode) {
    const inviter = await prisma.user.findUnique({ where: { referralCode: body.inviteCode } });
    if (!inviter) return res.status(400).json({ message: "Invalid invite code" });
    referredById = inviter.id;
  }

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone ? body.phone : null,
      passwordHash,
      role: "USER",
      referralCode,
      referredById
    },
    select: { id: true, name: true, email: true, role: true, referralCode: true, points: true }
  });

  if (referredById) {
    await prisma.user.update({ where: { id: referredById }, data: { points: { increment: 1 } } });
  }

  return res.status(201).json({ user });
});

authRouter.post("/login", async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(1)
    })
    .parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !user.isActive) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const payload = { sub: user.id, role: user.role } as const;
  const accessToken = signAccessToken(payload);

  const refreshToken = signRefreshToken(payload);
  const refreshHash = sha256(refreshToken);

  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshHash,
      expiresAt
    }
  });

  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/refresh",
    expires: expiresAt
  });

  return res.json({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      referralCode: user.referralCode,
      points: user.points
    }
  });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
  if (!token) return res.status(401).json({ message: "Missing refresh token" });

  let payload: { sub: string; role: "USER" | "ADMIN" };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ message: "Invalid refresh token" });
  }

  const tokenHash = sha256(token);
  const dbToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    }
  });

  if (!dbToken) return res.status(401).json({ message: "Refresh token revoked" });

  await prisma.refreshToken.update({ where: { id: dbToken.id }, data: { revokedAt: new Date() } });

  const newRefresh = signRefreshToken(payload);
  const newHash = sha256(newRefresh);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: payload.sub,
      tokenHash: newHash,
      expiresAt
    }
  });

  res.cookie(env.REFRESH_COOKIE_NAME, newRefresh, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/refresh",
    expires: expiresAt
  });

  const accessToken = signAccessToken(payload);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, referralCode: true, points: true }
  });

  return res.json({ accessToken, user });
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token) },
      data: { revokedAt: new Date() }
    });
  }

  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: "/api/auth/refresh" });
  return res.json({ ok: true });
});

authRouter.post("/forgot-password", async (req, res) => {
  const body = z.object({ email: z.string().email() }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) {
    return res.json({ ok: true });
  }

  const rawToken = randomToken(32);
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt
    }
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail({ to: user.email, resetUrl });

  return res.json({ ok: true });
});

authRouter.post("/reset-password", async (req, res) => {
  const body = z
    .object({
      token: z.string().min(1),
      password: z.string().min(8),
      confirmPassword: z.string().min(8)
    })
    .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" })
    .parse(req.body);

  const tokenHash = sha256(body.token);
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!record) return res.status(400).json({ message: "Invalid or expired reset token" });

  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(body.password) }
  });

  await prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  return res.json({ ok: true });
});

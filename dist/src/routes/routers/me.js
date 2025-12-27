import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
export const meRouter = Router();
meRouter.get("/", requireAuth, async (req, res) => {
    const userId = req.auth.sub;
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            referralCode: true,
            points: true,
            balanceCents: true,
            reservedBalanceCents: true,
            withdrawPasswordHash: true
        }
    });
    const teamCount = await prisma.user.count({ where: { referredById: userId } });
    return res.json({
        user: user
            ? {
                ...user,
                hasWithdrawPassword: Boolean(user.withdrawPasswordHash),
                withdrawPasswordHash: undefined
            }
            : null,
        teamCount
    });
});
meRouter.post("/withdraw-password", requireAuth, async (req, res) => {
    const body = z
        .object({
        currentPassword: z.string().optional(),
        password: z.string().min(4),
        confirmPassword: z.string().min(4)
    })
        .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" })
        .parse(req.body);
    const user = await prisma.user.findUnique({
        where: { id: req.auth.sub },
        select: { id: true, withdrawPasswordHash: true }
    });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    if (user.withdrawPasswordHash) {
        if (!body.currentPassword)
            return res.status(400).json({ message: "Current withdraw password is required" });
        const ok = await verifyPassword(body.currentPassword, user.withdrawPasswordHash);
        if (!ok)
            return res.status(400).json({ message: "Invalid current withdraw password" });
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { withdrawPasswordHash: await hashPassword(body.password) }
    });
    return res.json({ ok: true });
});
meRouter.get("/referral-bonuses", requireAuth, async (req, res) => {
    const bonuses = await prisma.referralBonus.findMany({
        where: { referrerId: req.auth.sub },
        include: {
            referred: { select: { id: true, name: true, email: true } },
            referrer: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: "desc" }
    });
    // Get order details separately
    const bonusesWithOrders = await Promise.all(bonuses.map(async (bonus) => {
        const order = await prisma.order.findUnique({
            where: { id: bonus.orderId },
            include: { product: { select: { name: true } } }
        });
        return { ...bonus, order };
    }));
    return res.json({ bonuses: bonusesWithOrders });
});
meRouter.get("/team", requireAuth, async (req, res) => {
    const teamMembers = await prisma.user.findMany({
        where: { referredById: req.auth.sub },
        select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            isActive: true,
            balanceCents: true,
            points: true,
            orders: {
                select: {
                    id: true,
                    status: true,
                    amountCents: true,
                    createdAt: true
                },
                orderBy: { createdAt: "desc" }
            }
        },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ teamMembers });
});
meRouter.post("/change-password", requireAuth, async (req, res) => {
    const body = z
        .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(4),
        confirmPassword: z.string().min(4)
    })
        .refine((v) => v.newPassword === v.confirmPassword, { message: "Passwords do not match" })
        .parse(req.body);
    const user = await prisma.user.findUnique({
        where: { id: req.auth.sub },
        select: { id: true, passwordHash: true }
    });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    const isValidPassword = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!isValidPassword)
        return res.status(400).json({ message: "Invalid current password" });
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.newPassword) }
    });
    return res.json({ ok: true });
});

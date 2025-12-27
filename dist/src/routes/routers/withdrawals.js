import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { verifyPassword } from "../../utils/password.js";
export const withdrawalsRouter = Router();
withdrawalsRouter.get("/mine", requireAuth, async (req, res) => {
    const list = await prisma.withdrawal.findMany({
        where: { userId: req.auth.sub },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ withdrawals: list });
});
withdrawalsRouter.post("/", requireAuth, async (req, res) => {
    const body = z
        .object({
        amountCents: z.coerce.number().int().positive(),
        method: z.enum(["COMMERCIAL_BANK", "TELEBIRR", "CBE_BIRR"]),
        accountName: z.string().optional(),
        accountNumber: z.string().optional(),
        phone: z.string().optional(),
        withdrawPassword: z.string().min(1)
    })
        .parse(req.body);
    const user = await prisma.user.findUnique({
        where: { id: req.auth.sub },
        select: { id: true, withdrawPasswordHash: true, balanceCents: true, reservedBalanceCents: true }
    });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    if (!user.withdrawPasswordHash)
        return res.status(400).json({ message: "Please set withdraw password first" });
    const ok = await verifyPassword(body.withdrawPassword, user.withdrawPasswordHash);
    if (!ok)
        return res.status(400).json({ message: "Invalid withdraw password" });
    const available = user.balanceCents - user.reservedBalanceCents;
    if (body.amountCents > available) {
        return res.status(400).json({ message: "Insufficient available balance" });
    }
    if (body.method === "COMMERCIAL_BANK") {
        if (!body.accountName?.trim() || !body.accountNumber?.trim()) {
            return res.status(400).json({ message: "Account name and account number are required" });
        }
    }
    if (body.method === "TELEBIRR" || body.method === "CBE_BIRR") {
        if (!body.phone?.trim()) {
            return res.status(400).json({ message: "Phone number is required" });
        }
    }
    const withdrawal = await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: user.id },
            data: { reservedBalanceCents: { increment: body.amountCents } }
        });
        return tx.withdrawal.create({
            data: {
                userId: user.id,
                amountCents: body.amountCents,
                method: body.method,
                accountName: body.method === "COMMERCIAL_BANK" ? body.accountName.trim() : null,
                accountNumber: body.method === "COMMERCIAL_BANK" ? body.accountNumber.trim() : null,
                phone: body.method !== "COMMERCIAL_BANK" ? body.phone.trim() : null,
                status: "PENDING"
            }
        });
    });
    return res.status(201).json({ withdrawal });
});

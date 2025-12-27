import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { verifyPassword } from "../../utils/password.js";
export const transactionsRouter = Router();
transactionsRouter.post("/send", requireAuth, async (req, res) => {
    const body = z
        .object({
        toUserId: z.string().cuid(),
        amountEtb: z.coerce.number().positive(),
        withdrawPassword: z.string().min(1)
    })
        .parse(req.body);
    if (body.toUserId === req.auth.sub) {
        return res.status(400).json({ message: "You cannot send money to yourself" });
    }
    const [sender, receiver] = await Promise.all([
        prisma.user.findUnique({
            where: { id: req.auth.sub },
            select: { id: true, withdrawPasswordHash: true, balanceCents: true, reservedBalanceCents: true }
        }),
        prisma.user.findUnique({
            where: { id: body.toUserId },
            select: { id: true, name: true, email: true, isActive: true }
        })
    ]);
    if (!sender)
        return res.status(404).json({ message: "Sender not found" });
    if (!receiver)
        return res.status(404).json({ message: "Recipient not found" });
    if (!receiver.isActive)
        return res.status(400).json({ message: "Recipient account is not active" });
    if (!sender.withdrawPasswordHash)
        return res.status(400).json({ message: "Withdraw password is required to send money" });
    const ok = await verifyPassword(body.withdrawPassword, sender.withdrawPasswordHash);
    if (!ok)
        return res.status(400).json({ message: "Invalid withdraw password" });
    const availableCents = sender.balanceCents - sender.reservedBalanceCents;
    const amountCents = Math.round(body.amountEtb * 100);
    if (amountCents > availableCents) {
        return res.status(400).json({ message: "Insufficient available balance" });
    }
    const result = await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: sender.id },
            data: { balanceCents: { decrement: amountCents } }
        });
        await tx.user.update({
            where: { id: receiver.id },
            data: { balanceCents: { increment: amountCents } }
        });
        return tx.transaction.create({
            data: {
                fromUserId: sender.id,
                toUserId: receiver.id,
                amountCents,
                type: "SEND"
            }
        });
    });
    return res.status(201).json({ transaction: result });
});
transactionsRouter.get("/sent", requireAuth, async (req, res) => {
    const list = await prisma.transaction.findMany({
        where: { fromUserId: req.auth.sub },
        include: { toUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ transactions: list });
});
transactionsRouter.get("/received", requireAuth, async (req, res) => {
    const list = await prisma.transaction.findMany({
        where: { toUserId: req.auth.sub },
        include: { fromUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ transactions: list });
});

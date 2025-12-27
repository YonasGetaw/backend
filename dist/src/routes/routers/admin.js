import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { prisma } from "../../db/prisma.js";
export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireRole("ADMIN"));
adminRouter.get("/analytics", async (_req, res) => {
    const [users, ordersPending, ordersAll] = await Promise.all([
        prisma.user.count({ where: { role: "USER" } }),
        prisma.order.count({ where: { status: "PENDING" } }),
        prisma.order.count()
    ]);
    const incomeCents = await prisma.order.aggregate({
        where: { status: { in: ["APPROVED", "COMPLETED"] } },
        _sum: { amountCents: true }
    });
    return res.json({
        users,
        orders: { total: ordersAll, pending: ordersPending },
        incomeCents: incomeCents._sum.amountCents ?? 0
    });
});
adminRouter.get("/products", async (_req, res) => {
    const products = await prisma.product.findMany({ orderBy: { createdAt: "desc" } });
    return res.json({ products });
});
adminRouter.post("/products", async (req, res) => {
    const body = z
        .object({
        name: z.string().min(2),
        description: z.string().min(5),
        priceCents: z.coerce.number().int().positive(),
        imageUrl: z.string().min(1)
    })
        .parse(req.body);
    const product = await prisma.product.create({ data: body });
    return res.status(201).json({ product });
});
adminRouter.patch("/products/:id", async (req, res) => {
    const body = z
        .object({
        name: z.string().min(2).optional(),
        description: z.string().min(5).optional(),
        priceCents: z.coerce.number().int().positive().optional(),
        imageUrl: z.string().min(1).optional(),
        isActive: z.boolean().optional()
    })
        .parse(req.body);
    const product = await prisma.product.update({ where: { id: req.params.id }, data: body });
    return res.json({ product });
});
adminRouter.delete("/products/:id", async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: req.params.id } });
        return res.json({ ok: true });
    }
    catch (e) {
        if (e.code === "P2002" || e.code === "P2014") {
            return res.status(400).json({ message: "Cannot delete product with existing orders" });
        }
        throw e;
    }
});
adminRouter.get("/payment-settings", async (_req, res) => {
    const settings = await prisma.paymentSettings.findFirst();
    return res.json({ settings });
});
adminRouter.put("/payment-settings", async (req, res) => {
    const body = z
        .object({
        commercialBankName: z.string().min(2),
        commercialAccountNumber: z.string().min(5),
        telebirrPhone: z.string().min(7),
        cbeBirrPhone: z.string().min(7)
    })
        .parse(req.body);
    const existing = await prisma.paymentSettings.findFirst();
    const settings = existing
        ? await prisma.paymentSettings.update({ where: { id: existing.id }, data: body })
        : await prisma.paymentSettings.create({ data: body });
    return res.json({ settings });
});
adminRouter.get("/orders", async (_req, res) => {
    const orders = await prisma.order.findMany({
        include: { product: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ orders });
});
adminRouter.patch("/orders/:id", async (req, res) => {
    const body = z
        .object({
        status: z.enum(["PENDING", "APPROVED", "REJECTED", "COMPLETED"])
    })
        .parse(req.body);
    const order = await prisma.order.update({
        where: { id: req.params.id },
        data: { status: body.status },
        include: { product: true, user: { select: { id: true, name: true, email: true } } }
    });
    return res.json({ order });
});
adminRouter.get("/users", async (_req, res) => {
    const users = await prisma.user.findMany({
        where: { role: "USER" },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, createdAt: true, isActive: true }
    });
    return res.json({ users });
});
adminRouter.get("/users/:id", async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, name: true, email: true, isActive: true }
    });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    return res.json({ user });
});
adminRouter.get("/withdrawals", async (_req, res) => {
    const withdrawals = await prisma.withdrawal.findMany({
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ withdrawals });
});
adminRouter.patch("/withdrawals/:id", async (req, res) => {
    const body = z
        .object({ status: z.enum(["APPROVED", "REJECTED"]) })
        .parse(req.body);
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!withdrawal)
        return res.status(404).json({ message: "Withdrawal not found" });
    if (withdrawal.status !== "PENDING")
        return res.status(400).json({ message: "Withdrawal already processed" });
    const updated = await prisma.$transaction(async (tx) => {
        if (body.status === "APPROVED") {
            await tx.user.update({
                where: { id: withdrawal.userId },
                data: {
                    reservedBalanceCents: { decrement: withdrawal.amountCents },
                    balanceCents: { decrement: withdrawal.amountCents }
                }
            });
        }
        if (body.status === "REJECTED") {
            await tx.user.update({
                where: { id: withdrawal.userId },
                data: { reservedBalanceCents: { decrement: withdrawal.amountCents } }
            });
        }
        return tx.withdrawal.update({
            where: { id: withdrawal.id },
            data: body.status === "APPROVED"
                ? { status: "APPROVED", approvedAt: new Date() }
                : { status: "REJECTED", rejectedAt: new Date() },
            include: { user: { select: { id: true, name: true, email: true } } }
        });
    });
    return res.json({ withdrawal: updated });
});

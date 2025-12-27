import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
export const ordersRouter = Router();
ordersRouter.get("/mine", requireAuth, async (req, res) => {
    const orders = await prisma.order.findMany({
        where: { userId: req.auth.sub },
        include: { product: true },
        orderBy: { createdAt: "desc" }
    });
    return res.json({ orders });
});
ordersRouter.post("/", requireAuth, async (req, res) => {
    const body = z
        .object({
        productId: z.string().min(1),
        paymentMethod: z.enum(["COMMERCIAL_BANK", "TELEBIRR", "CBE_BIRR"]),
        paymentProofImageUrl: z.string().optional()
    })
        .parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || !product.isActive)
        return res.status(404).json({ message: "Product not found" });
    const order = await prisma.order.create({
        data: {
            userId: req.auth.sub,
            productId: product.id,
            paymentMethod: body.paymentMethod,
            amountCents: product.priceCents,
            status: "PENDING",
            paymentProofImageUrl: body.paymentProofImageUrl
        },
        include: { product: true }
    });
    return res.status(201).json({ order });
});
ordersRouter.patch("/:orderId/status", requireAuth, async (req, res) => {
    if (req.auth.role !== "ADMIN")
        return res.status(403).json({ message: "Admin only" });
    const body = z
        .object({
        status: z.enum(["APPROVED", "REJECTED", "COMPLETED"])
    })
        .parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { product: true, user: true } });
    if (!order)
        return res.status(404).json({ message: "Order not found" });
    const updated = await prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.update({
            where: { id: req.params.orderId },
            data: { status: body.status },
            include: { product: true }
        });
        if (body.status === "APPROVED" && order.status !== "APPROVED") {
            await tx.user.update({
                where: { id: order.userId },
                data: { balanceCents: { increment: order.amountCents } }
            });
            // Referral bonus: only on first approved order for a referred user
            if (order.user.referredById) {
                const existingBonus = await tx.referralBonus.findFirst({
                    where: { referredId: order.userId }
                });
                if (!existingBonus) {
                    const priceCents = order.product.priceCents;
                    // Tier mapping: you can customize these thresholds
                    let tier = 1;
                    let bonusCents = 0;
                    if (priceCents >= 10000) { // 100+ ETB
                        tier = 3;
                        bonusCents = Math.round(priceCents * 0.10); // 10%
                    }
                    else if (priceCents >= 5000) { // 50–99.99 ETB
                        tier = 2;
                        bonusCents = Math.round(priceCents * 0.05); // 5%
                    }
                    else { // < 50 ETB
                        tier = 1;
                        bonusCents = Math.round(priceCents * 0.03); // 3%
                    }
                    await tx.referralBonus.create({
                        data: {
                            referrerId: order.user.referredById,
                            referredId: order.userId,
                            orderId: order.id,
                            amountCents: bonusCents,
                            tier
                        }
                    });
                    await tx.user.update({
                        where: { id: order.user.referredById },
                        data: { balanceCents: { increment: bonusCents } }
                    });
                }
            }
        }
        return updatedOrder;
    });
    return res.json({ order: updated });
});
ordersRouter.get("/payment-details", requireAuth, async (_req, res) => {
    const settings = await prisma.paymentSettings.findFirst();
    return res.json({ settings });
});

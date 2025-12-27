import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { z } from "zod";

export const productsRouter = Router();

productsRouter.get("/", requireAuth, async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });
  return res.json({ products });
});

productsRouter.get("/featured", requireAuth, async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    take: 6
  });
  return res.json({ products });
});

productsRouter.post("/", requireAuth, async (req, res) => {
  if (req.auth!.role !== "ADMIN") return res.status(403).json({ message: "Admin only" });

  const body = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    priceCents: z.number().min(0),
    imageUrl: z.string().optional()
  }).parse(req.body);

  const product = await prisma.product.create({
    data: {
      name: body.name,
      description: body.description,
      priceCents: body.priceCents,
      imageUrl: body.imageUrl
    }
  });

  return res.status(201).json({ product });
});

productsRouter.patch("/:id", requireAuth, async (req, res) => {
  if (req.auth!.role !== "ADMIN") return res.status(403).json({ message: "Admin only" });

  const body = z.object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    priceCents: z.number().min(0).optional(),
    imageUrl: z.string().optional(),
    isActive: z.boolean().optional()
  }).parse(req.body);

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: body
  });

  return res.json({ product });
});

productsRouter.delete("/:id", requireAuth, async (req, res) => {
  if (req.auth!.role !== "ADMIN") return res.status(403).json({ message: "Admin only" });

  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (e: any) {
    if (e.code === "P2002" || e.code === "P2014" || e.message?.includes("foreign key constraint")) {
      return res.status(400).json({ message: "Cannot delete product with existing orders" });
    }
    throw e;
  }
});

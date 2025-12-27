import type { Request, Response, NextFunction } from "express";

export function requireRole(role: "USER" | "ADMIN") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    if (req.auth.role !== role) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type JwtUser } from "../utils/tokens.js";

declare global {
  namespace Express {
    interface Request {
      auth?: JwtUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

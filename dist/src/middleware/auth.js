import { verifyAccessToken } from "../utils/tokens.js";
export function requireAuth(req, res, next) {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        req.auth = verifyAccessToken(token);
        next();
    }
    catch {
        return res.status(401).json({ message: "Invalid token" });
    }
}

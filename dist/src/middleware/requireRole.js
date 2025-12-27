export function requireRole(role) {
    return (req, res, next) => {
        if (!req.auth)
            return res.status(401).json({ message: "Unauthorized" });
        if (req.auth.role !== role)
            return res.status(403).json({ message: "Forbidden" });
        next();
    };
}

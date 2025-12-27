import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
export const app = express();
app.set("trust proxy", 1);
app.use(cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");
// Serve uploads with proper CORS headers
app.use("/uploads", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", env.CLIENT_ORIGIN);
    res.header("Access-Control-Allow-Methods", "GET");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    next();
}, express.static(uploadsDir, {
    maxAge: '1d', // Cache for 1 day
    etag: true,
    lastModified: true
}));
app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});
// Test endpoint to verify image serving
app.get("/api/test-images", (_req, res) => {
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, "..", "uploads");
    try {
        const files = fs.readdirSync(uploadsDir).slice(0, 5); // Get first 5 files
        const imageUrls = files.map((file) => `${env.API_BASE_URL}/uploads/${file}`);
        res.json({
            message: "Test images",
            imageUrls,
            uploadsDir: "/uploads"
        });
    }
    catch (error) {
        res.json({ error: "Could not read uploads directory" });
    }
});
// Alternative image serving endpoint with full control
app.get("/api/images/:filename", (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, "..", "uploads");
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    // Security check: ensure the filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: "Invalid filename" });
    }
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Image not found" });
    }
    // Set proper headers
    res.setHeader('Access-Control-Allow-Origin', env.CLIENT_ORIGIN);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache
    // Send the file
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Error serving image" });
            }
        }
    });
});
app.use("/api", apiRouter);
app.use((err, _req, res, _next) => {
    console.error(err);
    // Handle multer errors
    if (err instanceof Error && err.message.includes("Only image files are allowed")) {
        return res.status(400).json({ message: err.message });
    }
    if (err instanceof Error && err.message.includes("File too large")) {
        return res.status(400).json({ message: "File size too large. Maximum size is 5MB." });
    }
    res.status(500).json({ message: "Internal server error" });
});

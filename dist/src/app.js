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
app.use(helmet());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");
app.use("/uploads", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", env.CLIENT_ORIGIN);
    res.header("Access-Control-Allow-Credentials", "true");
    next();
}, express.static(uploadsDir));
app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});
app.use("/api", apiRouter);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
});

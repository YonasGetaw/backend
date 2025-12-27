import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
export const uploadRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadsDir))
            fs.mkdirSync(uploadsDir, { recursive: true });
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${uuidv4()}${ext}`;
        cb(null, name);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
uploadRouter.post("/image", upload.single("file"), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ message: "No file uploaded" });
    const origin = `${req.protocol}://${req.get("host")}`;
    const url = `${origin}/uploads/${req.file.filename}`;
    return res.json({ url });
});

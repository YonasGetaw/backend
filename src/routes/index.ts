import { Router } from "express";
import { authRouter } from "./routers/auth.js";
import { productsRouter } from "./routers/products.js";
import { meRouter } from "./routers/me.js";
import { ordersRouter } from "./routers/orders.js";
import { withdrawalsRouter } from "./routers/withdrawals.js";
import { transactionsRouter } from "./routers/transactions.js";
import { adminRouter } from "./routers/admin.js";
import { uploadRouter } from "../routers/upload.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/me", meRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/withdrawals", withdrawalsRouter);
apiRouter.use("/transactions", transactionsRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/upload", uploadRouter);

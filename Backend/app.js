import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import customerRoutes from "./routes/customer.routes.js";
import productsRouter from "./routes/product.routes.js";
import wishlistRouter from "./routes/wishlist.routes.js";
import cartRouter from "./routes/cart.routes.js";
import orderRouter from "./routes/order.routes.js";
import { razorpayWebhook } from "./controllers/order.controller.js";

// Builds the Express app. Configuration and the Razorpay client are injected,
// which keeps the server testable without real credentials.
export function createApp(config, { razorpay = null } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.locals.config = config;
  app.locals.razorpay = razorpay;

  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || config.clientOrigins.includes(origin.toLowerCase())),
      credentials: true,
    })
  );

  // Razorpay signs the exact bytes it sends, so this route must see the raw body.
  app.post(
    "/webhooks/razorpay",
    express.raw({ type: "application/json", limit: "100kb" }),
    razorpayWebhook
  );

  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

  app.use("/customers", customerRoutes);
  app.use("/products", productsRouter);
  app.use("/wishlist", wishlistRouter);
  app.use("/cart", cartRouter);
  app.use("/orders", orderRouter);

  app.use((req, res) => res.status(404).json({ error: "Route not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body too large" });
    }
    console.error("Unhandled error:", err?.message || err);
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

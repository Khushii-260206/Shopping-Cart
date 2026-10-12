import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import requireAdmin from "../middlewares/admin.middleware.js";
import {
  createPaymentOrder,
  verifyPayment,
  mockPay,
  getOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/order.controller.js";

const orderRouter = express.Router();

orderRouter.post("/create-payment-order", authMiddleware, createPaymentOrder);
orderRouter.post("/verify-payment", authMiddleware, verifyPayment);
orderRouter.post("/", authMiddleware, createPaymentOrder);
orderRouter.get("/", authMiddleware, getOrders);
orderRouter.post("/:id/mock-pay", authMiddleware, mockPay);
orderRouter.get("/:id", authMiddleware, getOrderById);
orderRouter.patch("/:id/status", authMiddleware, requireAdmin, updateOrderStatus);

export default orderRouter;

import crypto from "crypto";
import mongoose from "mongoose";
import Customer from "../models/customer.model.js";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import {
  describeRazorpayError,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../services/payment.service.js";
import {
  itemsFingerprint,
  markOrderPaid,
  markPaymentFailed,
  toPaise,
} from "../services/order.service.js";
import { isObjectId, isNonEmptyString, parseShippingAddress } from "../utils/validate.js";

const STATUS_FLOW = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED"];

const paymentsUnavailable = (req) => {
  const { config } = req.app.locals;
  const { razorpay } = req.app.locals;
  return (
    config.payments.mode === "disabled" ||
    (config.payments.mode === "razorpay" && !razorpay)
  );
};

const paymentResponse = (req, order, status = 200) => {
  const { config } = req.app.locals;
  return {
    success: true,
    shopKartOrderId: order._id,
    razorpayOrderId: order.razorpayOrderId,
    amount: toPaise(order.totalAmount),
    currency: "INR",
    // The key id is public by design; the key secret never leaves the server.
    key: config.razorpay.keyId || null,
    mock: order.paymentMode === "MOCK",
    order,
    _status: status,
  };
};

const send = (res, payload) => {
  const { _status, ...body } = payload;
  return res.status(_status).json(body);
};

// POST /orders/create-payment-order
export const createPaymentOrder = async (req, res) => {
  try {
    if (paymentsUnavailable(req)) {
      return res.status(503).json({ error: "Payments are not configured on the server." });
    }

    const { config, razorpay } = req.app.locals;
    const useMock = config.payments.mode === "mock";

    const parsed = parseShippingAddress(req.body?.shippingAddress);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const userId = req.user._id;
    const user = await Customer.findById(userId);
    if (!user) return res.status(404).json({ error: "Customer not found" });
    if (!user.cart || user.cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Price everything from the database. Nothing price-related comes from the browser.
    const productIds = user.cart.map((item) => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    let totalPaise = 0;
    const items = [];
    for (const cartItem of user.cart) {
      const product = byId.get(String(cartItem.product));
      if (!product) {
        return res.status(400).json({
          error: "An item in your cart is no longer available. Please review your cart.",
        });
      }
      if (product.stock < cartItem.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}.` });
      }
      totalPaise += toPaise(product.price) * cartItem.quantity;
      items.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: cartItem.quantity,
        image: product.image,
      });
    }
    const totalAmount = totalPaise / 100;
    const paymentMode = useMock ? "MOCK" : "RAZORPAY";

    // A repeated checkout of the same cart (double click, retry after a failed
    // payment) reuses the open order instead of piling up duplicates.
    const fingerprint = itemsFingerprint(items);
    const candidates = await Order.find({
      user: userId,
      status: "PENDING_PAYMENT",
      paymentStatus: { $in: ["PENDING", "FAILED"] },
      paymentMode,
      totalAmount,
    })
      .sort({ createdAt: -1 })
      .limit(5);
    const reusable = candidates.find(
      (candidate) => candidate.razorpayOrderId && itemsFingerprint(candidate.items) === fingerprint
    );
    if (reusable) {
      reusable.shippingAddress = parsed.value;
      await reusable.save();
      return send(res, paymentResponse(req, reusable, 200));
    }

    const orderId = new mongoose.Types.ObjectId();
    let razorpayOrderId;

    if (useMock) {
      razorpayOrderId = `order_mock_${orderId}`;
    } else {
      try {
        const rzpOrder = await razorpay.orders.create({
          amount: totalPaise,
          currency: "INR",
          receipt: String(orderId),
          notes: { shopKartOrderId: String(orderId) },
        });
        if (!rzpOrder?.id || Number(rzpOrder.amount) !== totalPaise) {
          throw new Error("Unexpected response from payment provider");
        }
        razorpayOrderId = rzpOrder.id;
      } catch (rzpErr) {
        console.error("Razorpay order creation failed:", describeRazorpayError(rzpErr));
        return res.status(502).json({
          error: "We could not start the payment. Please try again in a moment.",
        });
      }
    }

    const order = await Order.create({
      _id: orderId,
      user: userId,
      items,
      shippingAddress: parsed.value,
      totalAmount,
      paymentStatus: "PENDING",
      status: "PENDING_PAYMENT",
      paymentMode,
      razorpayOrderId,
    });

    return send(res, paymentResponse(req, order, 201));
  } catch (err) {
    console.error("Error creating payment order:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const conflictResponse = (res) =>
  res.status(409).json({
    success: false,
    message: "This order already has a different payment recorded.",
  });

// POST /orders/verify-payment
export const verifyPayment = async (req, res) => {
  try {
    const { config } = req.app.locals;
    if (config.payments.mode !== "razorpay") {
      return res.status(503).json({ error: "Payments are not configured on the server." });
    }

    const {
      shopKartOrderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    if (
      !isObjectId(shopKartOrderId) ||
      !isNonEmptyString(razorpayOrderId) ||
      !isNonEmptyString(razorpayPaymentId) ||
      !isNonEmptyString(razorpaySignature, 500)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required payment details",
      });
    }

    const order = await Order.findById(shopKartOrderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (order.paymentMode !== "RAZORPAY") {
      return res.status(400).json({ success: false, message: "This order cannot be verified here." });
    }

    // The payment must belong to the Razorpay order WE created for this order.
    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: "Payment does not match this order" });
    }

    const signatureOk = verifyPaymentSignature({
      orderId: order.razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
      secret: config.razorpay.keySecret,
    });
    if (!signatureOk) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    let result;
    try {
      result = await markOrderPaid(order._id, razorpayPaymentId);
    } catch (err) {
      if (err?.code === 11000) return conflictResponse(res);
      throw err;
    }
    if (result.outcome === "conflict") return conflictResponse(res);

    return res.status(200).json({
      success: true,
      message:
        result.outcome === "paid"
          ? "Payment verified successfully"
          : "Payment was already verified",
      order: result.order,
    });
  } catch (err) {
    console.error("Error verifying payment:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// POST /orders/:id/mock-pay  (development only; 404 unless ALLOW_MOCK_PAYMENTS is active)
export const mockPay = async (req, res) => {
  try {
    const { config } = req.app.locals;
    if (config.payments.mode !== "mock") {
      return res.status(404).json({ error: "Not found" });
    }
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid order id" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (order.paymentMode !== "MOCK") {
      return res.status(400).json({ error: "Only mock orders can use mock payment" });
    }

    const paymentId = `mock_pay_${crypto.randomBytes(8).toString("hex")}`;
    const result = await markOrderPaid(order._id, paymentId);
    if (result.outcome === "conflict") return conflictResponse(res);

    return res.status(200).json({ success: true, message: "Test payment recorded", order: result.order });
  } catch (err) {
    console.error("Error recording mock payment:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// POST /webhooks/razorpay  (body arrives raw so the signature can be checked)
export const razorpayWebhook = async (req, res) => {
  try {
    const { config } = req.app.locals;
    const secret = config.razorpay.webhookSecret;
    if (config.payments.mode !== "razorpay" || !secret) {
      return res.status(503).json({ error: "Webhook is not configured" });
    }

    const signature = req.get("x-razorpay-signature");
    if (!verifyWebhookSignature({ rawBody: req.body, signature, secret })) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const payment = event?.payload?.payment?.entity;
    const rzpOrderId = payment?.order_id || event?.payload?.order?.entity?.id;
    const order = rzpOrderId ? await Order.findOne({ razorpayOrderId: rzpOrderId }) : null;

    // Acknowledge unknown orders so Razorpay does not retry forever.
    if (!order || order.paymentMode !== "RAZORPAY") {
      return res.status(200).json({ received: true, ignored: true });
    }

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const amountMatches =
        payment && Number(payment.amount) === toPaise(order.totalAmount) && payment.currency === "INR";
      if (!payment?.id || !amountMatches) {
        console.warn(`Webhook amount/payment mismatch for order ${order._id}; ignored.`);
        return res.status(200).json({ received: true, ignored: true });
      }
      try {
        await markOrderPaid(order._id, payment.id);
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    } else if (event.event === "payment.failed") {
      await markPaymentFailed(order._id);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Error handling Razorpay webhook:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("Error fetching orders:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(404).json({ error: "Order not found" });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "Forbidden: You cannot view orders that do not belong to you",
      });
    }

    return res.status(200).json({ success: true, order });
  } catch (err) {
    console.error("Error fetching single order:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /orders/:id/status  (administrators only; fulfilment progress of PAID orders)
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!STATUS_FLOW.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${STATUS_FLOW.join(", ")}`,
      });
    }
    if (!isObjectId(id)) return res.status(404).json({ error: "Order not found" });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.paymentStatus !== "PAID") {
      return res.status(400).json({ error: "Only paid orders can be progressed" });
    }
    if (STATUS_FLOW.indexOf(status) <= STATUS_FLOW.indexOf(order.status)) {
      return res.status(400).json({
        error: `Order is already ${order.status}; it can only move forward`,
      });
    }

    // Compare-and-set so two concurrent updates cannot skip or reorder steps.
    const updated = await Order.findOneAndUpdate(
      { _id: id, status: order.status, paymentStatus: "PAID" },
      { $set: { status } },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ error: "Order changed while updating; please retry" });
    }

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      order: updated,
    });
  } catch (err) {
    console.error("Error updating order status:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

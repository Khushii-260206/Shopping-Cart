import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Customer from "../models/customer.model.js";

export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

// Stable fingerprint of an order's lines, used to recognise a repeated checkout.
export const itemsFingerprint = (items) =>
  items
    .map((item) => `${item.product}:${item.quantity}:${item.price}`)
    .sort()
    .join("|");

// Deduct stock and clear the buyer's cart exactly once for a paid order.
// The stockDeducted flag is claimed atomically, so a retry or a concurrent
// webhook/browser verification cannot deduct twice.
export const applyFulfilment = async (order) => {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, stockDeducted: false },
    { $set: { stockDeducted: true } }
  );
  if (!claimed) return;

  for (const item of order.items) {
    // Conditional update: stock can never go negative.
    const result = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } }
    );
    if (result.modifiedCount === 0) {
      console.warn(
        `Stock shortfall after payment: order ${order._id}, product ${item.product}. Needs manual follow-up.`
      );
    }
  }

  // Remove only what was bought; anything added to the cart since stays there.
  await Customer.updateOne(
    { _id: order.user },
    { $pull: { cart: { product: { $in: order.items.map((item) => item.product) } } } }
  );
};

// The single place an order becomes PAID. Safe to call repeatedly.
// Returns { order, outcome } where outcome is "paid" (this call did it),
// "already-paid" (same payment already recorded) or "conflict" (a different payment).
export const markOrderPaid = async (orderId, paymentId) => {
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: { $ne: "PAID" }, status: "PENDING_PAYMENT" },
    {
      $set: {
        paymentStatus: "PAID",
        status: "PLACED",
        razorpayPaymentId: paymentId,
        paidAt: new Date(),
      },
    },
    { new: true }
  );

  if (updated) {
    await applyFulfilment(updated);
    return { order: await Order.findById(orderId), outcome: "paid" };
  }

  const existing = await Order.findById(orderId);
  if (existing?.paymentStatus === "PAID" && existing.razorpayPaymentId === paymentId) {
    // Repair a crash between the two steps above, then report success.
    await applyFulfilment(existing);
    return { order: existing, outcome: "already-paid" };
  }
  return { order: existing, outcome: "conflict" };
};

// Records a failed payment attempt. Never touches an order that is already paid.
export const markPaymentFailed = async (orderId) =>
  Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: "PENDING" },
    { $set: { paymentStatus: "FAILED" } },
    { new: true }
  );

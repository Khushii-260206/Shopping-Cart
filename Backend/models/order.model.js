import mongoose from "mongoose";

// Lifecycle
//   paymentStatus: PENDING -> (FAILED) -> PAID      (PAID is final)
//   status:        PENDING_PAYMENT -> PLACED -> CONFIRMED -> SHIPPED -> DELIVERED
// An order only leaves PENDING_PAYMENT through a verified payment
// (signature check, signed webhook, or the development-only mock).
const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        image: { type: String },
      },
    ],

    shippingAddress: {
      fullName: String,
      phone: String,
      addressLine1: String,
      city: String,
      state: String,
      pincode: String,
    },

    totalAmount: { type: Number, required: true, min: 0 },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
    },

    status: {
      type: String,
      enum: ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "SHIPPED", "DELIVERED"],
      default: "PENDING_PAYMENT",
    },

    // RAZORPAY for real test/live payments, MOCK only in the development mock mode.
    paymentMode: {
      type: String,
      enum: ["RAZORPAY", "MOCK"],
      default: "RAZORPAY",
    },

    razorpayOrderId: { type: String, index: true, sparse: true },
    // Unique so one payment can never be applied to two orders.
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    paidAt: Date,

    // Flipped exactly once (atomically) when stock is deducted for a paid order.
    stockDeducted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;

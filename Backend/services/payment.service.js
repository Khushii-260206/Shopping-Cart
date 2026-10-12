import crypto from "crypto";
import Razorpay from "razorpay";

const hmacHex = (payload, secret) =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

// Constant-time comparison; false for anything that is not a matching hex string.
const safeEqualHex = (expected, received) => {
  if (typeof received !== "string" || received.length !== expected.length) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Razorpay checkout signature: HMAC-SHA256 of "<razorpay_order_id>|<razorpay_payment_id>"
// using the key secret (https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#16-verify-payment-signature).
export const verifyPaymentSignature = ({ orderId, paymentId, signature, secret }) => {
  if (!orderId || !paymentId || !secret) return false;
  return safeEqualHex(hmacHex(`${orderId}|${paymentId}`, secret), signature);
};

// Webhook signature: HMAC-SHA256 of the RAW request body using the webhook secret.
export const verifyWebhookSignature = ({ rawBody, signature, secret }) => {
  if (!Buffer.isBuffer(rawBody) || !secret) return false;
  return safeEqualHex(hmacHex(rawBody, secret), signature);
};

// Returns a Razorpay client, or null when no keys are configured.
export const createRazorpayClient = (config) => {
  const { keyId, keySecret } = config.razorpay;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

// Safe description of an SDK error: never includes keys or request headers.
export const describeRazorpayError = (err) =>
  err?.error?.description || err?.message || "unknown error";

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../services/payment.service.js";

const secret = "test_secret_for_unit_tests";
const hmac = (payload, key = secret) => crypto.createHmac("sha256", key).update(payload).digest("hex");

test("accepts a correct checkout signature", () => {
  const signature = hmac("order_A|pay_B");
  assert.equal(verifyPaymentSignature({ orderId: "order_A", paymentId: "pay_B", signature, secret }), true);
});

test("rejects wrong, empty, truncated, non-string and swapped signatures", () => {
  const good = hmac("order_A|pay_B");
  const attempts = [
    "bad",
    "",
    undefined,
    null,
    12345,
    good.slice(0, -1),
    good + "0",
    hmac("pay_B|order_A"),
    hmac("order_A|pay_B", "another_secret"),
    "signature_here",
  ];
  for (const signature of attempts) {
    assert.equal(
      verifyPaymentSignature({ orderId: "order_A", paymentId: "pay_B", signature, secret }),
      false,
      `should reject ${String(signature)}`
    );
  }
});

test("rejects a valid signature for a different order or payment id", () => {
  const signature = hmac("order_A|pay_B");
  assert.equal(verifyPaymentSignature({ orderId: "order_X", paymentId: "pay_B", signature, secret }), false);
  assert.equal(verifyPaymentSignature({ orderId: "order_A", paymentId: "pay_X", signature, secret }), false);
});

test("never verifies when the secret or ids are missing", () => {
  const signature = hmac("order_A|pay_B", "");
  assert.equal(verifyPaymentSignature({ orderId: "order_A", paymentId: "pay_B", signature, secret: "" }), false);
  assert.equal(verifyPaymentSignature({ orderId: "", paymentId: "pay_B", signature, secret }), false);
});

test("webhook signature is computed over the raw bytes", () => {
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const signature = hmac(rawBody);
  assert.equal(verifyWebhookSignature({ rawBody, signature, secret }), true);
  // Re-serialised JSON with different whitespace must not verify.
  const reformatted = Buffer.from('{ "event": "payment.captured" }');
  assert.equal(verifyWebhookSignature({ rawBody: reformatted, signature, secret }), false);
  assert.equal(verifyWebhookSignature({ rawBody: rawBody.toString(), signature, secret }), false);
  assert.equal(verifyWebhookSignature({ rawBody, signature: "nope", secret }), false);
  assert.equal(verifyWebhookSignature({ rawBody, signature, secret: "" }), false);
});

// Starts the real backend for the browser end-to-end test (see /e2e).
// Test-only: uses throwaway secrets and, in "fake-razorpay" mode, an in-process
// stand-in for the Razorpay SDK so no payment provider is ever contacted.
import mongoose from "mongoose";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";

const mode = process.env.E2E_MODE; // "mock" | "fake-razorpay"
const env = {
  MONGODB_URI: process.env.E2E_MONGODB_URI,
  JWT_SECRET: "e2e-only-jwt-secret-value",
  PORT: process.env.E2E_PORT,
  CLIENT_ORIGIN: process.env.E2E_CLIENT_ORIGIN,
  ADMIN_EMAILS: "e2e-admin@example.com",
  ...(mode === "mock"
    ? { ALLOW_MOCK_PAYMENTS: "true" }
    : { RAZORPAY_KEY_ID: "rzp_test_e2e", RAZORPAY_KEY_SECRET: process.env.E2E_KEY_SECRET }),
};

const { config, errors } = loadConfig(env);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const fakeRazorpay = {
  orders: {
    create: async ({ amount, currency, receipt }) => ({ id: `order_e2e_${receipt}`, amount, currency }),
  },
};

await mongoose.connect(config.mongodbUri);
createApp(config, { razorpay: mode === "mock" ? null : fakeRazorpay }).listen(config.port, () =>
  console.log(`e2e backend ready (${mode})`)
);

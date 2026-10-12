import dotenv from "dotenv";

const MIN_JWT_SECRET_LENGTH = 16;

const parseList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

// Reads .env into process.env. Called once by the server entry point, never by tests.
export const loadEnvFile = () => dotenv.config({ quiet: true });

// Validates configuration without side effects. Returns { config, errors, warnings }.
// Messages only ever contain variable NAMES, never values.
export function loadConfig(env = process.env) {
  const errors = [];
  const warnings = [];
  const read = (name) => (env[name] || "").trim();

  const nodeEnv = read("NODE_ENV") || "development";
  const isProduction = nodeEnv === "production";

  const mongodbUri = read("MONGODB_URI");
  if (!mongodbUri) errors.push("MONGODB_URI is required (your MongoDB connection string).");

  const jwtSecret = read("JWT_SECRET");
  if (!jwtSecret) {
    errors.push("JWT_SECRET is required (a long random string used to sign login tokens).");
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long.`);
  }

  let port = 8000;
  if (read("PORT")) {
    port = Number(read("PORT"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push("PORT must be a whole number between 1 and 65535.");
    }
  }

  const sameSite = (read("COOKIE_SAMESITE") || "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(sameSite)) {
    errors.push("COOKIE_SAMESITE must be one of: lax, strict, none.");
  }

  const clientOrigins = parseList(read("CLIENT_ORIGIN") || "http://localhost:5173");

  const keyId = read("RAZORPAY_KEY_ID");
  const keySecret = read("RAZORPAY_KEY_SECRET");
  const webhookSecret = read("RAZORPAY_WEBHOOK_SECRET");
  if (Boolean(keyId) !== Boolean(keySecret)) {
    errors.push("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set together.");
  }
  const razorpayConfigured = Boolean(keyId && keySecret);
  if (razorpayConfigured && !isProduction && !keyId.startsWith("rzp_test_")) {
    warnings.push("RAZORPAY_KEY_ID does not look like a test key (rzp_test_...). Use test mode while developing.");
  }

  const mockRequested = read("ALLOW_MOCK_PAYMENTS") === "true";
  if (mockRequested && isProduction) {
    errors.push("ALLOW_MOCK_PAYMENTS must not be enabled when NODE_ENV=production.");
  }

  let paymentMode = "disabled";
  if (razorpayConfigured) {
    paymentMode = "razorpay";
    if (mockRequested) warnings.push("ALLOW_MOCK_PAYMENTS is ignored because Razorpay keys are configured.");
  } else if (mockRequested && !isProduction) {
    paymentMode = "mock";
    warnings.push("DEVELOPMENT MOCK PAYMENTS ARE ON. No real payment happens and orders are marked as test payments.");
  } else {
    warnings.push("Razorpay keys are not set: browsing works, but checkout is disabled.");
    if (isProduction) errors.push("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production.");
  }

  if (razorpayConfigured && !webhookSecret) {
    warnings.push("RAZORPAY_WEBHOOK_SECRET is not set: the payment webhook is disabled (browser verification still works).");
  }

  const config = {
    nodeEnv,
    isProduction,
    port,
    mongodbUri,
    jwtSecret,
    jwtExpiresIn: "7d",
    cookieMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    // "none" is only for a frontend and API on different sites; browsers require Secure with it.
    cookieSameSite: sameSite,
    clientOrigins,
    adminEmails: parseList(read("ADMIN_EMAILS")),
    razorpay: { keyId, keySecret, webhookSecret },
    payments: { mode: paymentMode },
  };

  return { config, errors, warnings };
}

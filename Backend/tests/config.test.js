import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config/env.js";

const base = {
  MONGODB_URI: "mongodb://localhost/test",
  JWT_SECRET: "a-sufficiently-long-secret",
};

test("reports every missing required variable by name", () => {
  const { errors } = loadConfig({});
  assert.ok(errors.some((e) => e.includes("MONGODB_URI")));
  assert.ok(errors.some((e) => e.includes("JWT_SECRET")));
});

test("rejects a too-short JWT secret without echoing it", () => {
  const { errors } = loadConfig({ ...base, JWT_SECRET: "short" });
  assert.ok(errors.some((e) => e.includes("JWT_SECRET")));
  assert.ok(!errors.join(" ").includes("short\""));
});

test("rejects an invalid PORT", () => {
  assert.ok(loadConfig({ ...base, PORT: "abc" }).errors.some((e) => e.includes("PORT")));
  assert.ok(loadConfig({ ...base, PORT: "70000" }).errors.some((e) => e.includes("PORT")));
});

test("defaults: port 8000, dev origin, payments disabled without keys", () => {
  const { config, errors, warnings } = loadConfig(base);
  assert.deepEqual(errors, []);
  assert.equal(config.port, 8000);
  assert.deepEqual(config.clientOrigins, ["http://localhost:5173"]);
  assert.equal(config.payments.mode, "disabled");
  assert.ok(warnings.some((w) => w.includes("checkout is disabled")));
});

test("Razorpay keys must be set together", () => {
  const { errors } = loadConfig({ ...base, RAZORPAY_KEY_ID: "rzp_test_x" });
  assert.ok(errors.some((e) => e.includes("set together")));
});

test("real keys enable razorpay mode and ignore the mock flag", () => {
  const { config, warnings } = loadConfig({
    ...base,
    RAZORPAY_KEY_ID: "rzp_test_x",
    RAZORPAY_KEY_SECRET: "secret",
    ALLOW_MOCK_PAYMENTS: "true",
  });
  assert.equal(config.payments.mode, "razorpay");
  assert.ok(warnings.some((w) => w.includes("ignored")));
});

test("mock payments work in development and say so loudly", () => {
  const { config, errors, warnings } = loadConfig({ ...base, ALLOW_MOCK_PAYMENTS: "true" });
  assert.deepEqual(errors, []);
  assert.equal(config.payments.mode, "mock");
  assert.ok(warnings.some((w) => w.includes("MOCK PAYMENTS")));
});

test("mock payments can NEVER be enabled in production", () => {
  const { errors } = loadConfig({ ...base, NODE_ENV: "production", ALLOW_MOCK_PAYMENTS: "true" });
  assert.ok(errors.some((e) => e.includes("ALLOW_MOCK_PAYMENTS")));
});

test("production requires Razorpay keys", () => {
  const { errors } = loadConfig({ ...base, NODE_ENV: "production" });
  assert.ok(errors.some((e) => e.includes("required in production")));
});

test("COOKIE_SAMESITE is validated and defaults to lax", () => {
  assert.equal(loadConfig(base).config.cookieSameSite, "lax");
  assert.equal(loadConfig({ ...base, COOKIE_SAMESITE: "None" }).config.cookieSameSite, "none");
  assert.ok(loadConfig({ ...base, COOKIE_SAMESITE: "weird" }).errors.some((e) => e.includes("COOKIE_SAMESITE")));
});

test("admin emails and origins are normalised", () => {
  const { config } = loadConfig({
    ...base,
    ADMIN_EMAILS: " Boss@Example.com , second@example.com ",
    CLIENT_ORIGIN: "http://A.test, http://b.test",
  });
  assert.deepEqual(config.adminEmails, ["boss@example.com", "second@example.com"]);
  assert.deepEqual(config.clientOrigins, ["http://a.test", "http://b.test"]);
});

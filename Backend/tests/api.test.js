import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import Customer from "../models/customer.model.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startTestDatabase } from "./helpers/db.js";

const BACKEND_DIR = fileURLToPath(new URL("..", import.meta.url));

const KEY_SECRET = "test_key_secret_for_automated_tests";
const WEBHOOK_SECRET = "test_webhook_secret_for_automated_tests";
const JWT_SECRET = "test-jwt-secret-for-automated-tests";
const ADMIN_EMAIL = "admin@example.com";

const baseEnv = { MONGODB_URI: "mongodb://unused/test", JWT_SECRET };
const mkConfig = (extra) => {
  const { config, errors } = loadConfig({ ...baseEnv, ...extra });
  assert.deepEqual(errors, []);
  return config;
};

// Fake Razorpay SDK: records calls, never touches the network.
const razorpayCalls = [];
let razorpayShouldFail = false;
const fakeRazorpay = {
  orders: {
    create: async (params) => {
      razorpayCalls.push(params);
      if (razorpayShouldFail) throw { statusCode: 500, error: { description: "boom" } };
      return { id: `order_test_${params.receipt}`, amount: params.amount, currency: params.currency };
    },
  },
};

let db, servers = [], main, noPay, mock;

const serve = (config, razorpay) =>
  new Promise((resolve) => {
    const app = createApp(config, { razorpay });
    const server = app.listen(0, "127.0.0.1", () => {
      servers.push(server);
      resolve({ base: `http://127.0.0.1:${server.address().port}`, config });
    });
  });

class Client {
  constructor(target) { this.target = target; this.cookie = ""; this.lastSetCookie = ""; }
  async req(method, path, body, headers = {}) {
    const res = await fetch(this.target.base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined || method === "GET" || method === "HEAD"
        ? undefined
        : typeof body === "string" ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      this.lastSetCookie = setCookie;
      const pair = setCookie.split(";")[0];
      this.cookie = pair === "token=" ? "" : pair;
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data, headers: res.headers };
  }
}

let counter = 0;
const newUser = async (target, email) => {
  const client = new Client(target);
  const address = email || `user${++counter}_${Date.now()}@example.com`;
  const reg = await client.req("POST", "/customers/register", {
    fullName: "Test Shopper", email: address, password: "secret1", phone: "9876543210",
  });
  assert.equal(reg.status, 201);
  const login = await client.req("POST", "/customers/login", { email: address, password: "secret1" });
  assert.equal(login.status, 200);
  client.email = address;
  return client;
};

// The administrator account is created once and reused (its email is in ADMIN_EMAILS).
let adminClient;
const getAdmin = async () => {
  if (adminClient) return adminClient;
  const client = new Client(main);
  await client.req("POST", "/customers/register", {
    fullName: "Admin", email: ADMIN_EMAIL, password: "secret1", phone: "9876543210",
  });
  const login = await client.req("POST", "/customers/login", { email: ADMIN_EMAIL, password: "secret1" });
  assert.equal(login.status, 200);
  adminClient = client;
  return client;
};

const address = { fullName: "Test Shopper", phone: "98765 43210", address: "12 Rose Lane", city: "Pune", state: "Maharashtra", pincode: "411001" };
const hmac = (payload, key) => crypto.createHmac("sha256", key).update(payload).digest("hex");
const checkoutSignature = (orderId, paymentId) => hmac(`${orderId}|${paymentId}`, KEY_SECRET);

const products = {};
const makeProduct = (name, price, stock, category = "Home") =>
  Product.create({ name, description: "A test product", price, category, image: "https://example.com/x.jpg", stock });

// Creates a pending order for `client` containing `qty` of `product`.
const startCheckout = async (client, product, qty = 1) => {
  await client.req("DELETE", `/cart/${product._id}`);
  for (let i = 0; i < qty; i++) {
    const add = await client.req("POST", `/cart/${product._id}`);
    assert.equal(add.status, 200);
  }
  const res = await client.req("POST", "/orders/create-payment-order", { shippingAddress: address });
  assert.ok([200, 201].includes(res.status), `create-payment-order gave ${res.status}: ${JSON.stringify(res.data)}`);
  return res.data;
};

const payFor = (client, checkout, paymentId) =>
  client.req("POST", "/orders/verify-payment", {
    shopKartOrderId: String(checkout.shopKartOrderId),
    razorpay_order_id: checkout.razorpayOrderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: checkoutSignature(checkout.razorpayOrderId, paymentId),
  });

const stockOf = async (product) => (await Product.findById(product._id)).stock;

before(async () => {
  db = await startTestDatabase();
  if (!db) return;
  await Customer.init(); await Order.init(); await Product.init();
  main = await serve(
    mkConfig({ RAZORPAY_KEY_ID: "rzp_test_unit", RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, ADMIN_EMAILS: ADMIN_EMAIL }),
    fakeRazorpay
  );
  noPay = await serve(mkConfig({}), null);
  mock = await serve(mkConfig({ ALLOW_MOCK_PAYMENTS: "true" }), null);

  products.lamp = await makeProduct("Test Lamp", 1999.5, 1000);
  products.mug = await makeProduct("Test Mug", 349, 1000, "Kitchen");
  products.scarce = await makeProduct("Scarce Item", 50, 5);
});

after(async () => {
  for (const s of servers) await new Promise((r) => s.close(r));
  await db?.stop();
});

const dbTest = (name, fn) =>
  test(name, async (t) => {
    if (!db) return t.skip("No MongoDB available: install mongod or set TEST_MONGODB_URI");
    await fn(t);
  });

// ---------------------------------------------------------------- auth
dbTest("auth: registration validation and duplicates", async () => {
  const c = new Client(main);
  const ok = { fullName: "A", email: "dup@example.com", password: "secret1", phone: "9876543210" };
  assert.equal((await c.req("POST", "/customers/register", { ...ok, phone: "" })).status, 400);
  assert.equal((await c.req("POST", "/customers/register", { ...ok, email: "nope" })).status, 400);
  assert.equal((await c.req("POST", "/customers/register", { ...ok, password: "123" })).status, 400);
  assert.equal((await c.req("POST", "/customers/register", { ...ok, password: {} })).status, 400);
  assert.equal((await c.req("POST", "/customers/register", { ...ok, password: "x".repeat(80) })).status, 400);
  assert.equal((await c.req("POST", "/customers/register", ok)).status, 201);
  const dupe = await c.req("POST", "/customers/register", { ...ok, email: "DUP@Example.com" });
  assert.equal(dupe.status, 409, "email uniqueness must be case-insensitive");
});

dbTest("auth: passwords are hashed, never returned", async () => {
  const c = await newUser(main);
  const stored = await Customer.findOne({ email: c.email });
  assert.notEqual(stored.password, "secret1");
  assert.match(stored.password, /^\$2[aby]\$/);
  const me = await c.req("POST", "/customers/me");
  assert.equal(JSON.stringify(me.data).includes("password"), false);
});

dbTest("auth: login errors and returned fields", async () => {
  const c = await newUser(main);
  const anon = new Client(main);
  assert.equal((await anon.req("POST", "/customers/login", { email: c.email, password: "wrong" })).status, 401);
  assert.equal((await anon.req("POST", "/customers/login", { email: "nobody@example.com", password: "secret1" })).status, 401);
  assert.equal((await anon.req("POST", "/customers/login", { email: c.email })).status, 400);
  assert.equal((await anon.req("POST", "/customers/login", { email: c.email, password: { $ne: "" } })).status, 400);
  assert.equal((await anon.req("POST", "/customers/login", { email: { $ne: "" }, password: "secret1" })).status, 400);
  const good = await anon.req("POST", "/customers/login", { email: c.email.toUpperCase(), password: "secret1" });
  assert.equal(good.status, 200);
  assert.equal(good.data.customer.fullName, "Test Shopper");
});

dbTest("auth: cookie is HttpOnly, SameSite=Lax, expires, and not Secure in development", async () => {
  const c = await newUser(main);
  const cookie = c.lastSetCookie;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=\d+/i);
  assert.doesNotMatch(cookie, /;\s*Secure/i);
  const token = c.cookie.replace("token=", "");
  const payload = jwt.verify(token, JWT_SECRET);
  assert.ok(payload.exp && payload.exp > payload.iat, "token must carry an expiry");
});

dbTest("auth: invalid, expired, tampered and wrongly-signed tokens are rejected", async () => {
  const c = await newUser(main);
  const user = await Customer.findOne({ email: c.email });
  const probe = (token) => {
    const anon = new Client(main);
    anon.cookie = `token=${token}`;
    return anon.req("POST", "/customers/me");
  };
  assert.equal((await probe(jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: -10 }))).status, 401);
  assert.equal((await probe(jwt.sign({ id: String(user._id) }, "some-other-secret-value"))).status, 401);
  assert.equal((await probe(jwt.sign({ id: "not-an-id" }, JWT_SECRET))).status, 401);
  assert.equal((await probe(jwt.sign({ id: String(new mongoose.Types.ObjectId()) }, JWT_SECRET))).status, 401);
  assert.equal((await probe(c.cookie.replace("token=", "") + "x")).status, 401);
  assert.equal((await probe("garbage")).status, 401);
  // "alg: none" tokens must not be accepted
  const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." +
    Buffer.from(JSON.stringify({ id: String(user._id) })).toString("base64url") + ".";
  assert.equal((await probe(none)).status, 401);
  assert.equal((await probe(c.cookie.replace("token=", ""))).status, 200);
});

dbTest("auth: protected routes reject anonymous requests", async () => {
  const anon = new Client(main);
  const id = String(products.lamp._id);
  for (const [method, path] of [
    ["GET", "/products"], ["GET", `/products/${id}`], ["GET", "/cart"], ["POST", `/cart/${id}`],
    ["GET", "/wishlist"], ["GET", "/orders"], ["POST", "/orders/create-payment-order"],
    ["POST", "/orders/verify-payment"], ["POST", "/customers/me"],
  ]) {
    assert.equal((await anon.req(method, path, {})).status, 401, `${method} ${path}`);
  }
});

dbTest("auth: logout clears the cookie", async () => {
  const c = await newUser(main);
  const out = await c.req("POST", "/customers/logout");
  assert.equal(out.status, 200);
  assert.match(c.lastSetCookie, /token=;/);
  assert.equal((await c.req("POST", "/customers/me")).status, 401);
});

dbTest("api: unknown routes and malformed JSON return JSON errors", async () => {
  const c = new Client(main);
  const missing = await c.req("GET", "/does-not-exist");
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error, "Route not found");
  const bad = await c.req("POST", "/customers/login", "{not json");
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, "Invalid JSON body");
  assert.equal((await c.req("GET", "/health")).data.status, "ok");
  assert.equal(missing.headers.get("x-powered-by"), null);
});

dbTest("api: CORS only allows the configured frontend origin", async () => {
  const allowed = await fetch(main.base + "/health", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  const denied = await fetch(main.base + "/health", { headers: { Origin: "http://evil.example" } });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

// ------------------------------------------------------------ products
dbTest("products: only administrators can create products", async () => {
  const shopper = await newUser(main);
  const payload = { name: "Admin Item", description: "d", price: 10, category: "Home", image: "https://example.com/a.jpg", stock: 0 };
  assert.equal((await shopper.req("POST", "/products", payload)).status, 403);
  assert.equal((await shopper.req("POST", "/customers/me")).data.isAdmin, false);

  const admin = await getAdmin();
  assert.equal((await admin.req("POST", "/customers/me")).data.isAdmin, true);
  const created = await admin.req("POST", "/products", payload);
  assert.equal(created.status, 201, "stock 0 must be allowed");
  assert.equal((await admin.req("POST", "/products", { ...payload, price: -1 })).status, 400);
  assert.equal((await admin.req("POST", "/products", { ...payload, price: "10" })).status, 400);
  assert.equal((await admin.req("POST", "/products", { ...payload, stock: 1.5 })).status, 400);
  assert.equal((await admin.req("POST", "/products", { ...payload, stock: -1 })).status, 400);
  assert.equal((await admin.req("POST", "/products", { ...payload, name: "" })).status, 400);
});

dbTest("products: list, filter, sort, search are safe and correct", async () => {
  const c = await newUser(main);
  const all = (await c.req("GET", "/products")).data;
  assert.equal(all.success, true);
  assert.equal(all.count, all.products.length);
  assert.ok(all.products.length >= 2);
  const kitchen = (await c.req("GET", "/products?category=kitchen")).data.products;
  assert.ok(kitchen.length >= 1 && kitchen.every((p) => p.category === "Kitchen"));
  const asc = (await c.req("GET", "/products?sort=price_asc")).data.products.map((p) => p.price);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const desc = (await c.req("GET", "/products?sort=price_desc")).data.products.map((p) => p.price);
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  for (const evil of ["(", "[", ".*", "\\", "a{1"]) {
    assert.equal((await c.req("GET", `/products?search=${encodeURIComponent(evil)}`)).status, 200, `search ${evil}`);
  }
  assert.equal((await c.req("GET", "/products?search=lamp")).data.products.length >= 1, true);
  assert.equal((await c.req("GET", "/products/xyz")).status, 400);
  assert.equal((await c.req("GET", `/products/${new mongoose.Types.ObjectId()}`)).status, 404);
  assert.equal((await c.req("GET", `/products/${products.lamp._id}`)).data.name, "Test Lamp");
});

// ------------------------------------------------------- cart/wishlist
dbTest("cart: add, update, limits, remove, and deleted products", async () => {
  const c = await newUser(main);
  const id = String(products.scarce._id);
  assert.equal((await c.req("POST", `/cart/${id}`)).status, 200);
  assert.equal((await c.req("PATCH", `/cart/${id}`, { quantity: 3 })).data.cart[0].quantity, 3);
  assert.equal((await c.req("PATCH", `/cart/${id}`, { quantity: 5 })).status, 200);
  assert.equal((await c.req("POST", `/cart/${id}`)).status, 400, "adding beyond stock is refused");
  assert.equal((await c.req("PATCH", `/cart/${id}`, { quantity: 3 })).status, 200);
  assert.equal((await c.req("PATCH", `/cart/${id}`, { quantity: 99 })).status, 400);
  assert.equal((await c.req("PATCH", `/cart/${id}`, { quantity: 0 })).status, 400);
  assert.equal((await c.req("PATCH", `/cart/${id}`, { quantity: "x" })).status, 400);
  assert.equal((await c.req("POST", "/cart/xyz")).status, 404);
  assert.equal((await c.req("POST", `/cart/${new mongoose.Types.ObjectId()}`)).status, 404);

  const ghost = await makeProduct("Ghost", 5, 5);
  await c.req("POST", `/cart/${ghost._id}`);
  await Product.deleteOne({ _id: ghost._id });
  const cart = await c.req("GET", "/cart");
  assert.equal(cart.status, 200, "a deleted product must not crash the cart");
  assert.equal(cart.data.cart.length, 1);
  assert.equal((await c.req("DELETE", `/cart/${id}`)).status, 200);
  assert.equal((await c.req("GET", "/cart")).data.cart.length, 0);
});

dbTest("wishlist: add, duplicate, count, remove", async () => {
  const c = await newUser(main);
  const id = String(products.lamp._id);
  assert.equal((await c.req("POST", `/wishlist/${id}`)).status, 200);
  assert.equal((await c.req("POST", `/wishlist/${id}`)).status, 409);
  assert.equal((await c.req("POST", "/wishlist/xyz")).status, 400);
  assert.equal((await c.req("GET", "/wishlist/count")).data.count, 1);
  assert.equal((await c.req("GET", "/wishlist")).data.wishlist[0].name, "Test Lamp");
  assert.equal((await c.req("DELETE", `/wishlist/${id}`)).status, 200);
  assert.equal((await c.req("DELETE", `/wishlist/${id}`)).status, 404);
});

// ------------------------------------------------------------- checkout
dbTest("checkout: payments disabled returns 503 and creates nothing", async () => {
  const c = await newUser(noPay);
  await c.req("POST", `/cart/${products.mug._id}`);
  const res = await c.req("POST", "/orders/create-payment-order", { shippingAddress: address });
  assert.equal(res.status, 503);
  assert.equal(await Order.countDocuments({ user: (await Customer.findOne({ email: c.email }))._id }), 0);
  assert.equal((await c.req("POST", "/orders/verify-payment", {})).status, 503);
});

dbTest("checkout: validation errors", async () => {
  const c = await newUser(main);
  const pay = (shippingAddress) => c.req("POST", "/orders/create-payment-order", { shippingAddress });
  assert.equal((await c.req("POST", "/orders/create-payment-order", {})).status, 400);
  assert.equal((await pay(address)).data.error, "Cart is empty");
  await c.req("POST", `/cart/${products.mug._id}`);
  assert.equal((await pay({ ...address, pincode: "12" })).status, 400);
  assert.equal((await pay({ ...address, phone: "123" })).status, 400);
  assert.equal((await pay({ ...address, city: "" })).status, 400);
  assert.equal((await pay({ ...address, city: { $ne: "" } })).status, 400);
  assert.equal((await pay("a string")).status, 400);
});

dbTest("checkout: totals come from the database, never from the browser", async () => {
  const c = await newUser(main);
  await c.req("POST", `/cart/${products.lamp._id}`);
  await c.req("PATCH", `/cart/${products.lamp._id}`, { quantity: 3 });
  razorpayCalls.length = 0;
  const res = await c.req("POST", "/orders/create-payment-order", {
    shippingAddress: address,
    totalAmount: 1, amount: 1, price: 1, paymentStatus: "PAID", status: "DELIVERED",
    items: [{ product: String(products.lamp._id), price: 1, quantity: 1 }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.amount, 599850, "3 x 1999.50 rupees in paise");
  assert.equal(res.data.currency, "INR");
  assert.equal(res.data.mock, false);
  assert.equal(razorpayCalls.length, 1);
  assert.equal(razorpayCalls[0].amount, 599850);
  assert.equal(razorpayCalls[0].currency, "INR");
  assert.equal(res.data.order.totalAmount, 5998.5);
  assert.equal(res.data.order.paymentStatus, "PENDING");
  assert.equal(res.data.order.status, "PENDING_PAYMENT");
  assert.equal(res.data.order.items[0].price, 1999.5);
  assert.equal(JSON.stringify(res.data).includes(KEY_SECRET), false, "key secret must never be sent to the browser");
});

dbTest("checkout: repeating checkout reuses the open order instead of duplicating it", async () => {
  const c = await newUser(main);
  const first = await startCheckout(c, products.mug, 1);
  razorpayCalls.length = 0;
  const second = await c.req("POST", "/orders/create-payment-order", { shippingAddress: address });
  assert.equal(second.status, 200);
  assert.equal(String(second.data.shopKartOrderId), String(first.shopKartOrderId));
  assert.equal(second.data.razorpayOrderId, first.razorpayOrderId);
  assert.equal(razorpayCalls.length, 0);
  const user = await Customer.findOne({ email: c.email });
  assert.equal(await Order.countDocuments({ user: user._id }), 1);
  // A changed cart is a different order.
  await c.req("POST", `/cart/${products.mug._id}`);
  const third = await c.req("POST", "/orders/create-payment-order", { shippingAddress: address });
  assert.notEqual(String(third.data.shopKartOrderId), String(first.shopKartOrderId));
});

dbTest("checkout: provider failure returns 502 and leaves no order behind", async () => {
  const c = await newUser(main);
  await c.req("POST", `/cart/${products.mug._id}`);
  razorpayShouldFail = true;
  try {
    const res = await c.req("POST", "/orders/create-payment-order", { shippingAddress: address });
    assert.equal(res.status, 502);
    const user = await Customer.findOne({ email: c.email });
    assert.equal(await Order.countDocuments({ user: user._id }), 0);
  } finally {
    razorpayShouldFail = false;
  }
});

dbTest("checkout: insufficient stock and vanished products are refused", async () => {
  const c = await newUser(main);
  const rare = await makeProduct("Rare", 10, 1);
  await c.req("POST", `/cart/${rare._id}`);
  await Product.updateOne({ _id: rare._id }, { stock: 0 });
  assert.match((await c.req("POST", "/orders/create-payment-order", { shippingAddress: address })).data.error, /stock/i);
  await Product.deleteOne({ _id: rare._id });
  assert.equal((await c.req("POST", "/orders/create-payment-order", { shippingAddress: address })).status, 400);
});

// --------------------------------------------------- payment verification
dbTest("verify: rejects missing fields, bad signatures and mismatched order ids without touching the order", async () => {
  const c = await newUser(main);
  const stockBefore = await stockOf(products.mug);
  const checkout = await startCheckout(c, products.mug, 1);
  const body = {
    shopKartOrderId: String(checkout.shopKartOrderId),
    razorpay_order_id: checkout.razorpayOrderId,
    razorpay_payment_id: "pay_bad_attempt",
    razorpay_signature: checkoutSignature(checkout.razorpayOrderId, "pay_bad_attempt"),
  };
  const post = (override) => c.req("POST", "/orders/verify-payment", { ...body, ...override });

  assert.equal((await post({ razorpay_signature: undefined })).status, 400);
  assert.equal((await post({ razorpay_payment_id: undefined })).status, 400);
  assert.equal((await post({ shopKartOrderId: "xyz" })).status, 400);
  assert.equal((await post({ razorpay_signature: "signature_here" })).status, 400, "the old placeholder signature must not work");
  assert.equal((await post({ razorpay_signature: "0".repeat(64) })).status, 400);
  assert.equal((await post({ razorpay_signature: { $ne: "" } })).status, 400);
  assert.equal((await post({ razorpay_order_id: "order_someone_elses" })).status, 400, "payment must belong to this order's Razorpay order");
  assert.equal((await post({ razorpay_order_id: undefined })).status, 400);
  // valid signature, but for a payment on a DIFFERENT razorpay order id
  assert.equal(
    (await post({ razorpay_order_id: "order_other", razorpay_signature: checkoutSignature("order_other", "pay_bad_attempt") })).status,
    400
  );
  assert.equal((await post({ shopKartOrderId: String(new mongoose.Types.ObjectId()) })).status, 404);

  const order = await Order.findById(checkout.shopKartOrderId);
  assert.equal(order.paymentStatus, "PENDING");
  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(order.razorpayPaymentId, undefined);
  assert.equal(await stockOf(products.mug), stockBefore);
});

dbTest("verify: a valid signature marks the order paid exactly once", async () => {
  const c = await newUser(main);
  const stockBefore = await stockOf(products.lamp);
  const checkout = await startCheckout(c, products.lamp, 2);

  const first = await payFor(c, checkout, "pay_good_1");
  assert.equal(first.status, 200);
  assert.equal(first.data.order.paymentStatus, "PAID");
  assert.equal(first.data.order.status, "PLACED");
  assert.ok(first.data.order.paidAt);
  assert.equal(await stockOf(products.lamp), stockBefore - 2);
  assert.equal((await c.req("GET", "/cart")).data.cart.length, 0, "cart emptied after payment");

  const repeat = await payFor(c, checkout, "pay_good_1");
  assert.equal(repeat.status, 200, "repeating the same verification is harmless");
  assert.equal(await stockOf(products.lamp), stockBefore - 2, "stock must not be deducted twice");

  const different = await payFor(c, checkout, "pay_good_2");
  assert.equal(different.status, 409, "a second, different payment must not overwrite the first");
  const order = await Order.findById(checkout.shopKartOrderId);
  assert.equal(order.razorpayPaymentId, "pay_good_1");
});

dbTest("verify: concurrent duplicate requests deduct stock once", async () => {
  const c = await newUser(main);
  const thing = await makeProduct("Concurrent", 100, 20);
  const checkout = await startCheckout(c, thing, 3);
  const results = await Promise.all(Array.from({ length: 6 }, () => payFor(c, checkout, "pay_race")));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
  assert.equal(await stockOf(thing), 17);
  assert.equal(await Order.countDocuments({ razorpayPaymentId: "pay_race" }), 1);
});

dbTest("verify: users cannot confirm or read other people's orders", async () => {
  const owner = await newUser(main);
  const intruder = await newUser(main);
  const checkout = await startCheckout(owner, products.mug, 1);
  assert.equal((await payFor(intruder, checkout, "pay_intruder")).status, 403);
  assert.equal((await intruder.req("GET", `/orders/${checkout.shopKartOrderId}`)).status, 403);
  assert.equal((await owner.req("GET", `/orders/${checkout.shopKartOrderId}`)).status, 200);
  assert.equal((await intruder.req("GET", "/orders")).data.orders.length, 0);
  assert.equal((await owner.req("GET", "/orders/xyz")).status, 404);
  assert.equal((await owner.req("GET", `/orders/${new mongoose.Types.ObjectId()}`)).status, 404);
  const order = await Order.findById(checkout.shopKartOrderId);
  assert.equal(order.paymentStatus, "PENDING");
});

dbTest("verify: one payment id can never be applied to two orders", async () => {
  const a = await newUser(main);
  const b = await newUser(main);
  const checkoutA = await startCheckout(a, products.mug, 1);
  const checkoutB = await startCheckout(b, products.mug, 1);
  assert.equal((await payFor(a, checkoutA, "pay_shared")).status, 200);
  assert.equal((await payFor(b, checkoutB, "pay_shared")).status, 409);
  assert.equal((await Order.findById(checkoutB.shopKartOrderId)).paymentStatus, "PENDING");
});

// ------------------------------------------------------------- webhook
const sendWebhook = (target, event, { secret = WEBHOOK_SECRET, signature } = {}) => {
  const raw = JSON.stringify(event);
  return fetch(target.base + "/webhooks/razorpay", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature ?? hmac(raw, secret) },
    body: raw,
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));
};
const capturedEvent = (checkout, paymentId, amount = checkout.amount) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: checkout.razorpayOrderId, amount, currency: "INR", status: "captured" } } },
});

dbTest("webhook: disabled without a secret, rejects bad signatures", async () => {
  assert.equal((await sendWebhook(noPay, { event: "x" })).status, 503);
  const c = await newUser(main);
  const checkout = await startCheckout(c, products.mug, 1);
  const event = capturedEvent(checkout, "pay_webhook_bad");
  assert.equal((await sendWebhook(main, event, { signature: "0".repeat(64) })).status, 400);
  assert.equal((await sendWebhook(main, event, { signature: "" })).status, 400);
  assert.equal((await sendWebhook(main, event, { secret: "wrong-secret" })).status, 400);
  assert.equal((await Order.findById(checkout.shopKartOrderId)).paymentStatus, "PENDING");
});

dbTest("webhook: a signed payment.captured pays the order once, even if repeated", async () => {
  const c = await newUser(main);
  const stockBefore = await stockOf(products.mug);
  const checkout = await startCheckout(c, products.mug, 2);
  const event = capturedEvent(checkout, "pay_webhook_ok");
  assert.equal((await sendWebhook(main, event)).status, 200);
  assert.equal((await sendWebhook(main, event)).status, 200);
  const order = await Order.findById(checkout.shopKartOrderId);
  assert.equal(order.paymentStatus, "PAID");
  assert.equal(order.status, "PLACED");
  assert.equal(await stockOf(products.mug), stockBefore - 2);
  // The browser verification arriving afterwards is also harmless.
  assert.equal((await payFor(c, checkout, "pay_webhook_ok")).status, 200);
  assert.equal(await stockOf(products.mug), stockBefore - 2);
});

dbTest("webhook: wrong amount or unknown order is acknowledged but ignored", async () => {
  const c = await newUser(main);
  const checkout = await startCheckout(c, products.mug, 1);
  assert.equal((await sendWebhook(main, capturedEvent(checkout, "pay_cheap", 100))).status, 200);
  assert.equal((await Order.findById(checkout.shopKartOrderId)).paymentStatus, "PENDING");
  const unknown = { event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: "order_unknown", amount: 1, currency: "INR" } } } };
  const res = await sendWebhook(main, unknown);
  assert.equal(res.status, 200);
  assert.equal(res.data.ignored, true);
});

dbTest("webhook: failed payments are recorded but can never downgrade a paid order", async () => {
  const c = await newUser(main);
  const checkout = await startCheckout(c, products.mug, 1);
  const failed = { event: "payment.failed", payload: { payment: { entity: { id: "pay_f", order_id: checkout.razorpayOrderId } } } };
  assert.equal((await sendWebhook(main, failed)).status, 200);
  assert.equal((await Order.findById(checkout.shopKartOrderId)).paymentStatus, "FAILED");
  assert.equal((await Order.findById(checkout.shopKartOrderId)).status, "PENDING_PAYMENT");

  // The customer retries and succeeds.
  assert.equal((await payFor(c, checkout, "pay_retry_ok")).status, 200);
  assert.equal((await Order.findById(checkout.shopKartOrderId)).paymentStatus, "PAID");

  // A late failure event must not undo it.
  assert.equal((await sendWebhook(main, failed)).status, 200);
  const order = await Order.findById(checkout.shopKartOrderId);
  assert.equal(order.paymentStatus, "PAID");
  assert.equal(order.status, "PLACED");
});

// ------------------------------------------------- admin order status
dbTest("order status: only administrators move paid orders forward, one way", async () => {
  const shopper = await newUser(main);
  const admin = await getAdmin();

  const unpaid = await startCheckout(shopper, products.mug, 1);
  assert.equal((await shopper.req("PATCH", `/orders/${unpaid.shopKartOrderId}/status`, { status: "SHIPPED" })).status, 403, "owners are not administrators");
  assert.equal((await admin.req("PATCH", `/orders/${unpaid.shopKartOrderId}/status`, { status: "SHIPPED" })).status, 400, "unpaid orders cannot be progressed");

  await payFor(shopper, unpaid, "pay_status_flow");
  const url = `/orders/${unpaid.shopKartOrderId}/status`;
  assert.equal((await admin.req("PATCH", url, { status: "NOPE" })).status, 400);
  assert.equal((await admin.req("PATCH", url, { status: "PENDING_PAYMENT" })).status, 400);
  assert.equal((await admin.req("PATCH", url, { status: "PLACED" })).status, 400, "no change is not a transition");
  assert.equal((await admin.req("PATCH", url, { status: "SHIPPED" })).data.order.status, "SHIPPED");
  assert.equal((await admin.req("PATCH", url, { status: "CONFIRMED" })).status, 400, "cannot move backwards");
  assert.equal((await admin.req("PATCH", url, { status: "DELIVERED" })).data.order.status, "DELIVERED");
  assert.equal((await admin.req("PATCH", "/orders/xyz/status", { status: "SHIPPED" })).status, 404);
});

// -------------------------------------------------------- mock payments
dbTest("mock payments: only exist when explicitly enabled, and are clearly labelled", async () => {
  // Disabled on a normal server
  const normal = await newUser(main);
  const real = await startCheckout(normal, products.mug, 1);
  assert.equal((await normal.req("POST", `/orders/${real.shopKartOrderId}/mock-pay`)).status, 404);

  // Enabled in mock mode
  const c = await newUser(mock);
  await c.req("POST", `/cart/${products.mug._id}`);
  const res = await c.req("POST", "/orders/create-payment-order", { shippingAddress: address });
  assert.equal(res.status, 201);
  assert.equal(res.data.mock, true);
  assert.match(res.data.razorpayOrderId, /^order_mock_/);
  assert.equal(res.data.order.paymentMode, "MOCK");

  // The real verification route refuses to run in mock mode.
  assert.equal((await c.req("POST", "/orders/verify-payment", {
    shopKartOrderId: String(res.data.shopKartOrderId), razorpay_order_id: res.data.razorpayOrderId,
    razorpay_payment_id: "pay_x", razorpay_signature: "x",
  })).status, 503);

  const other = await newUser(mock);
  assert.equal((await other.req("POST", `/orders/${res.data.shopKartOrderId}/mock-pay`)).status, 403);

  const paid = await c.req("POST", `/orders/${res.data.shopKartOrderId}/mock-pay`);
  assert.equal(paid.status, 200);
  assert.equal(paid.data.order.paymentStatus, "PAID");
  assert.equal(paid.data.order.paymentMode, "MOCK");
  assert.match(paid.data.order.razorpayPaymentId, /^mock_pay_/);
  assert.equal((await c.req("POST", `/orders/${res.data.shopKartOrderId}/mock-pay`)).status, 409, "a second mock payment cannot overwrite the first");

  // A real-mode order can never be paid through the mock route.
  const realOrder = await Order.create({
    user: (await Customer.findOne({ email: c.email }))._id, items: [], totalAmount: 1,
    paymentMode: "RAZORPAY", razorpayOrderId: "order_real_1",
  });
  assert.equal((await c.req("POST", `/orders/${realOrder._id}/mock-pay`)).status, 400);
});

dbTest("order history lists newest first and includes status fields", async () => {
  const c = await newUser(main);
  const first = await startCheckout(c, products.mug, 1);
  await payFor(c, first, "pay_hist_1");
  const second = await startCheckout(c, products.lamp, 1);
  const list = (await c.req("GET", "/orders")).data.orders;
  assert.equal(list.length, 2);
  assert.equal(String(list[0]._id), String(second.shopKartOrderId));
  assert.equal(list[1].paymentStatus, "PAID");
  assert.equal(list[0].status, "PENDING_PAYMENT");
});

// ---------------------------------------------------- calculations and integrity
dbTest("totals: prices are summed exactly in paise, across several products", async () => {
  const c = await newUser(main);
  const odd = await makeProduct("Odd Price", 19.99, 50);
  const dime = await makeProduct("Tiny Price", 0.1, 50);
  await c.req("POST", `/cart/${odd._id}`);
  await c.req("PATCH", `/cart/${odd._id}`, { quantity: 3 });
  await c.req("POST", `/cart/${dime._id}`);
  await c.req("PATCH", `/cart/${dime._id}`, { quantity: 3 });
  await c.req("POST", `/cart/${products.mug._id}`);
  razorpayCalls.length = 0;
  const res = await c.req("POST", "/orders/create-payment-order", { shippingAddress: address });
  assert.equal(res.status, 201);
  // 3 x 19.99 + 3 x 0.10 + 1 x 349.00 = 59.97 + 0.30 + 349.00 = 409.27 rupees
  assert.equal(res.data.amount, 40927);
  assert.equal(razorpayCalls[0].amount, 40927);
  assert.equal(res.data.order.totalAmount, 409.27);
  assert.equal(res.data.order.items.length, 3);
});

dbTest("cart: every customer has a private cart", async () => {
  const a = await newUser(main);
  const b = await newUser(main);
  await a.req("POST", `/cart/${products.lamp._id}`);
  assert.equal((await a.req("GET", "/cart")).data.cart.length, 1);
  assert.equal((await b.req("GET", "/cart")).data.cart.length, 0);
  assert.equal((await b.req("PATCH", `/cart/${products.lamp._id}`, { quantity: 2 })).status, 404);
  await b.req("DELETE", `/cart/${products.lamp._id}`);
  assert.equal((await a.req("GET", "/cart")).data.cart.length, 1, "someone else's delete must not touch my cart");
});

dbTest("wishlist: the badge count matches the list when a product disappears", async () => {
  const c = await newUser(main);
  const keep = await makeProduct("Wishlist Keep", 10, 5);
  const gone = await makeProduct("Wishlist Gone", 10, 5);
  await c.req("POST", `/wishlist/${keep._id}`);
  await c.req("POST", `/wishlist/${gone._id}`);
  assert.equal((await c.req("GET", "/wishlist/count")).data.count, 2);
  await Product.deleteOne({ _id: gone._id });
  const list = (await c.req("GET", "/wishlist")).data.wishlist;
  assert.equal(list.length, 1);
  assert.equal((await c.req("GET", "/wishlist/count")).data.count, list.length);
});

dbTest("payment: only purchased lines leave the cart", async () => {
  const c = await newUser(main);
  const checkout = await startCheckout(c, products.mug, 1);
  await c.req("POST", `/cart/${products.lamp._id}`); // added after checkout began
  assert.equal((await payFor(c, checkout, "pay_partial_cart")).status, 200);
  const cart = (await c.req("GET", "/cart")).data.cart;
  assert.equal(cart.length, 1);
  assert.equal(cart[0].product.name, "Test Lamp");
});

dbTest("errors: an internal failure returns a generic { error } and leaks no details", async () => {
  const c = await newUser(main);
  const realFind = Product.find;
  const realConsoleError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(" "));
  Product.find = () => { throw new Error("secret internal detail: db host 10.0.0.5"); };
  try {
    const res = await c.req("GET", "/products");
    assert.equal(res.status, 500);
    assert.deepEqual(res.data, { error: "Internal server error" });
    assert.equal(JSON.stringify(res.data).includes("10.0.0.5"), false);
  } finally {
    Product.find = realFind;
    console.error = realConsoleError;
  }
  assert.ok(logged.some((line) => line.includes("Error listing products")), "the failure is logged server-side");
  assert.equal((await c.req("GET", "/products")).status, 200, "the app recovers afterwards");
});

// -------------------------------------------------------------------- seed script
dbTest("seed script: adds the sample catalogue, never deletes or duplicates", async () => {
  const keeper = await makeProduct("Keep Me After Seeding", 12.5, 3, "Custom");
  const run = () =>
    spawnSync("node", ["scripts/seed.js"], {
      cwd: BACKEND_DIR,
      env: { ...process.env, MONGODB_URI: db.uri },
      encoding: "utf8",
    });

  const before = await Product.countDocuments();
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const added = Number(/(\d+) added/.exec(first.stdout)?.[1]);
  assert.equal(added, 12);
  assert.equal(await Product.countDocuments(), before + 12);
  assert.ok(await Product.findById(keeper._id), "existing products must survive seeding");

  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /0 added, 12 already existed/);
  assert.equal(await Product.countDocuments(), before + 12, "re-running must not duplicate");

  const sample = await Product.findOne({ name: "Chunky Knit Throw" });
  assert.ok(sample.price > 0 && Number.isInteger(sample.stock) && sample.image.startsWith("https://"));
  assert.ok(await Product.findOne({ stock: 0 }), "the catalogue includes a sold-out item for the UI state");
});

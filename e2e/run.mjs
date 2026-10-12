// Browser end-to-end test: drives the real frontend against the real backend and a
// throwaway MongoDB using headless Chrome. Nothing here touches your .env files,
// your real database, or any payment provider.
//
//   node e2e/run.mjs
//
// Needs: Node 22+, Google Chrome/Chromium, and `mongod` on your PATH.
// Run `npm install` in Backend/ and Frontend/ first.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "Backend");
const FRONTEND = path.join(ROOT, "Frontend");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY_SECRET = "e2e_only_razorpay_key_secret";

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p) => p && fs.existsSync(p));

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });

const children = [];
const cleanups = [];
const run = (cmd, args, opts = {}) => { const c = spawn(cmd, args, { stdio: "ignore", ...opts }); children.push(c); return c; };
const shutdown = async () => {
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  for (const fn of cleanups) { try { fn(); } catch { /* best effort */ } }
};
process.on("exit", () => { for (const c of children) { try { c.kill(); } catch { /* */ } } });

const waitForHttp = async (url, label, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`${label} did not start`);
};

if (!CHROME) { console.error("Chrome/Chromium not found. Set CHROME_PATH to its executable."); process.exit(2); }
if (spawnSync("mongod", ["--version"], { stdio: "ignore" }).status !== 0) { console.error("`mongod` was not found on your PATH."); process.exit(2); }
for (const dir of [BACKEND, FRONTEND]) {
  if (!fs.existsSync(path.join(dir, "node_modules"))) { console.error(`Run \`npm install\` in ${path.basename(dir)}/ first.`); process.exit(2); }
}

// ---- infrastructure --------------------------------------------------------
const mongoDir = fs.mkdtempSync(path.join(os.tmpdir(), "shopkart-e2e-mongo-"));
cleanups.push(() => fs.rmSync(mongoDir, { recursive: true, force: true }));
const mongoPort = await freePort();
run("mongod", ["--dbpath", mongoDir, "--port", String(mongoPort), "--bind_ip", "127.0.0.1"]);
const mongoUri = `mongodb://127.0.0.1:${mongoPort}/shopkart_e2e`;
for (let i = 0; i < 60; i++) { if (await new Promise((r) => { const s = net.connect(mongoPort, "127.0.0.1", () => { s.destroy(); r(true); }); s.on("error", () => r(false)); })) break; await sleep(250); }

const seed = spawnSync("node", ["scripts/seed.js"], { cwd: BACKEND, env: { ...process.env, MONGODB_URI: mongoUri }, encoding: "utf8" });
if (seed.status !== 0) { console.error("Seeding failed:\n" + seed.stdout + seed.stderr); await shutdown(); process.exit(1); }

const apiPort = await freePort();
const webPort = await freePort();
const API = `http://localhost:${apiPort}`;
const APP = `http://localhost:${webPort}`;

run("npx", ["vite", "--port", String(webPort), "--strictPort", "--host", "localhost"], {
  cwd: FRONTEND,
  env: { ...process.env, VITE_API_URL: API },
});
await waitForHttp(APP, "frontend dev server");

let backend = null;
const startBackend = async (mode) => {
  if (backend) { backend.kill(); await sleep(500); }
  backend = run("node", ["tests/helpers/e2e-server.js"], {
    cwd: BACKEND,
    env: { ...process.env, E2E_MODE: mode, E2E_MONGODB_URI: mongoUri, E2E_PORT: String(apiPort), E2E_CLIENT_ORIGIN: APP, E2E_KEY_SECRET: KEY_SECRET },
  });
  await waitForHttp(API + "/health", "backend");
};

// ---- browser ---------------------------------------------------------------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shopkart-e2e-chrome-"));
cleanups.push(() => fs.rmSync(profile, { recursive: true, force: true }));

// Headless Chrome occasionally exits on its own during long runs. The harness notices,
// relaunches it with the same profile (so the login cookie survives), reopens the last
// page, and the final report says how many times that happened.
let currentStep = "(startup)", launchedAt = 0;
let chromeProcess = null, ws = null, browserAlive = false, relaunching = null, relaunches = 0, lastUrl = "about:blank";
let msgId = 0; const pending = new Map(); const consoleProblems = [];

const handleMessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === "Runtime.exceptionThrown") consoleProblems.push("EXCEPTION: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).slice(0, 250));
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    consoleProblems.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 250));
  }
};
const rawSend = (method, params = {}) => new Promise((res) => {
  const i = ++msgId;
  pending.set(i, res);
  try { ws.send(JSON.stringify({ id: i, method, params })); } catch { pending.delete(i); return res({ error: { message: "browser connection is closed" } }); }
  setTimeout(() => { if (pending.delete(i)) res({ error: { message: `browser command timed out: ${method}` } }); }, 8000);
});
const launchBrowser = async () => {
  try { chromeProcess?.kill(); } catch { /* already gone */ }
  const debugPort = await freePort();
  const proc = run(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--window-size=1280,1000", "about:blank"]);
  chromeProcess = proc;
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://localhost:${debugPort}/json/list`)).json(); if (targets.find((t) => t.type === "page")) break; } catch { /* not up yet */ } await sleep(250); }
  const sock = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (sock.onopen = r));
  sock.onmessage = handleMessage;
  const markGone = (why) => { if (ws === sock && browserAlive) { browserAlive = false; console.log(`NOTE: ${why} after ${Math.round((Date.now() - launchedAt) / 1000)}s, during step "${currentStep}"; the test will relaunch Chrome`); } };
  sock.onclose = (e) => markGone(`browser connection closed (code ${e.code})`);
  proc.on("exit", (code, signal) => markGone(`Chrome exited (code ${code}, signal ${signal})`));
  ws = sock; browserAlive = true; launchedAt = Date.now();
  await rawSend("Runtime.enable"); await rawSend("Page.enable");
};
const send = async (method, params = {}) => {
  if (!browserAlive) {
    if (!relaunching) { relaunches++; relaunching = launchBrowser().finally(() => { relaunching = null; }); }
    await relaunching;
    if (lastUrl !== "about:blank") { await rawSend("Page.navigate", { url: lastUrl }); await sleep(1500); }
  }
  return rawSend(method, params);
};
await launchBrowser();
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.error) throw new Error(r.error.message);
  if (r.result?.exceptionDetails) throw new Error("page script failed: " + String(r.result.exceptionDetails.exception?.description).slice(0, 160));
  return r.result?.result?.value;
};
const waitFor = async (expr, label, timeout = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await ev(`!!(${expr})`)) return; } catch { /* page may be navigating */ } await sleep(150); }
  throw new Error("timed out waiting for: " + label);
};
const pagePath = () => ev("location.pathname");
const goto = async (url) => { lastUrl = url; await send("Page.navigate", { url }); await sleep(700); };
const clickText = (sel, text) => ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.trim().includes(${JSON.stringify(text)}));if(!e)throw new Error('no element: '+${JSON.stringify(text)});e.click();return true})()`);
const fill = (sel, v) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)throw new Error('no input '+${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const setSelect = (sel, v) => ev(`(()=>{const s=document.querySelector(${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(v)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
// Real key events (not synthetic DOM clicks), so :focus-visible and browser focus order apply.
const pressKey = async (key, code, vk, shift = false) => {
  const modifiers = shift ? 8 : 0;
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
  await sleep(60);
};
const tab = (shift = false) => pressKey("Tab", "Tab", 9, shift);
const escape = () => pressKey("Escape", "Escape", 27);
const focusInfo = async () => JSON.parse(await ev(`(()=>{const e=document.activeElement;const cs=getComputedStyle(e);const r=e.getBoundingClientRect();return JSON.stringify({tag:e.tagName,id:e.id,text:(e.textContent||'').trim().slice(0,40),outline:cs.outlineStyle+' '+cs.outlineWidth,shadow:cs.boxShadow,width:Math.round(r.width),height:Math.round(r.height),inDialog:!!e.closest('[role=dialog]')})})()`));
// A visible indicator is either a drawn outline or a focus ring (box-shadow).
const hasFocusIndicator = (f) => (!/^none/.test(f.outline) && !/ 0px$/.test(f.outline)) || f.shadow !== "none";
const cartCount = (n) => `document.querySelector('header a[aria-label^="Cart"]')?.getAttribute('aria-label').startsWith('Cart, ${n}')`;
const cardCount = (n) => `document.querySelectorAll('main article').length===${n}`;
const apiFromPage = (method, p, body) => ev(`fetch(${JSON.stringify(API + p)},{method:${JSON.stringify(method)},credentials:'include',headers:{'Content-Type':'application/json'},body:${body ? JSON.stringify(JSON.stringify(body)) : "undefined"}}).then(async r=>JSON.stringify({s:r.status,d:await r.json().catch(()=>null)}))`).then(JSON.parse);

const results = []; let failed = 0;
const step = async (name, fn) => {
  currentStep = name;
  try { await fn(); results.push(["PASS", name]); console.log("PASS  " + name); }
  catch (e) {
    failed++;
    let where = "";
    try { where = await ev(`location.pathname+' | '+(document.querySelector('main')||document.body).innerText.replace(/\\s+/g,' ').slice(0,200)`); } catch { /* */ }
    results.push(["FAIL", name]);
    console.log(`FAIL  ${name}\n      ${e.message}\n      page: ${where}`);
  }
};

await send("Runtime.enable"); await send("Page.enable");

const journey = async (mode) => {
  console.log(`\n=== ${mode === "mock" ? "Development mock-payment mode" : "Razorpay handler path (fake provider)"} ===`);
  await startBackend(mode);
  const email = `shopper-${mode}-${Date.now()}@example.com`;

  await step("logged-out visitors are sent to /login", async () => { await goto(APP + "/cart"); await waitFor(`location.pathname==='/login'`, "/login"); });
  await step("keyboard: Tab reaches the login form in order, each stop shows a visible focus indicator", async () => {
    await goto(APP + "/login"); await waitFor(`!!document.querySelector('#email')`, "login form");
    await ev(`document.activeElement.blur(); true`);
    const stops = [];
    for (let i = 0; i < 8; i++) { await tab(); const f = await focusInfo(); stops.push(f); if (/Create an account/.test(f.text)) break; }
    const order = stops.map((f) => f.id || f.text);
    const at = (name) => order.findIndex((x) => x === name || x.startsWith(name));
    if (!(at("email") >= 0 && at("password") > at("email") && at("Log in") > at("password") && at("Create an account") > at("Log in"))) {
      throw new Error("unexpected focus order: " + JSON.stringify(order));
    }
    const noIndicator = stops.filter((f) => !hasFocusIndicator(f)).map((f) => f.id || f.text);
    if (noIndicator.length) throw new Error("no visible focus indicator on: " + JSON.stringify(noIndicator));
    // and Shift+Tab goes backwards
    await tab(true); const back = await focusInfo(); if (!/Log in/.test(back.text)) throw new Error("Shift+Tab did not go back to the Log in button: " + back.text);
  });
  await step("register -> login (wrong password shows an error first)", async () => {
    await clickText("a", "Create an account"); await waitFor(`location.pathname==='/register'`, "/register");
    await fill("#fullName", "E2E Shopper"); await fill("#email", email); await fill("#password", "secret1"); await fill("#phone", "9876543210");
    await clickText("button[type=submit]", "Create account"); await waitFor(`location.pathname==='/login'`, "redirect after register");
    await fill("#email", email); await fill("#password", "wrongpass"); await clickText("button[type=submit]", "Log in");
    await waitFor(`!!document.querySelector('[role=alert]')`, "login error");
    await fill("#password", "secret1"); await clickText("button[type=submit]", "Log in");
    await waitFor(`location.pathname==='/home'&&document.body.innerText.toLowerCase().includes('welcome back, e2e')`, "home greeting");
  });
  await step("keyboard: the first Tab on a store page reveals the 'Skip to content' link", async () => {
    await goto(APP + "/products"); await waitFor(cardCount(12), "products");
    await ev(`document.activeElement.blur(); true`);
    await tab(); const f = await focusInfo();
    if (!/Skip to content/.test(f.text)) throw new Error("first focus stop was: " + f.text);
    if (f.width < 20 || !hasFocusIndicator(f)) throw new Error("skip link not visibly revealed: " + JSON.stringify(f));
  });
  await step("shop: 12 seeded products, filter/search/sort, sold-out disabled", async () => {
    await clickText("header nav a", "Shop"); await waitFor(cardCount(12), "12 cards");
    await setSelect("#category", "Books"); await waitFor(cardCount(3), "3 books");
    await fill("#search", "poetry"); await waitFor(cardCount(1), "search");
    await fill("#search", "zzzz"); await waitFor(`document.body.innerText.includes('No products found')`, "empty state");
    await clickText("button", "Clear"); await waitFor(cardCount(12), "reset");
    await waitFor(`[...document.querySelectorAll('main article button')].some(b=>b.textContent.includes('Out of stock')&&b.disabled)`, "sold-out");
  });
  await step("add to cart and wishlist update the navbar badges", async () => {
    await clickText("main article button", "Add to cart"); await waitFor(cartCount(1), "cart 1");
    await clickText("main article button[aria-label^='Add']", ""); await waitFor(`document.querySelector('header a[aria-label^="Wishlist"]')?.getAttribute('aria-label').startsWith('Wishlist, 1')`, "wishlist 1");
  });
  await step("product details: wishlist toggle", async () => {
    await clickText("main article h2 a", "Over-Ear"); await waitFor(`/\\/products\\/[a-f0-9]{24}/.test(location.pathname)`, "details");
    await waitFor(`document.querySelector('button[aria-pressed=true]')`, "saved state");
    await clickText("button", "Saved"); await waitFor(`document.body.innerText.includes('Removed from your wishlist')`, "removed");
  });
  await step("cart: quantity, remove, empty state", async () => {
    await ev(`document.querySelector('header a[aria-label^="Cart"]').click()`); await waitFor(`location.pathname==='/cart'&&document.body.innerText.includes('Order summary')`, "cart");
    await sleep(1000);
    await ev(`document.querySelector('button[aria-label^="Increase"]').click()`); await waitFor(`document.querySelector('[role=group] span')?.textContent.trim()==='2'`, "qty 2");
    await ev(`document.querySelector('button[aria-label^="Decrease"]').click()`); await waitFor(`document.querySelector('[role=group] span')?.textContent.trim()==='1'`, "qty 1");
    await clickText("main button", "Remove"); await waitFor(`document.body.innerText.includes('Your cart is empty')`, "empty");
  });
  await step("checkout with an empty cart shows an empty state", async () => { await goto(APP + "/checkout"); await waitFor(`document.body.innerText.includes('Nothing to check out yet')`, "empty checkout"); });
  await step("checkout validates the form, then pays and shows the confirmation", async () => {
    await goto(APP + "/products"); await waitFor(cardCount(12), "products");
    await clickText("main article button", "Add to cart"); await waitFor(cartCount(1), "cart 1");
    await ev(`document.querySelector('header a[aria-label^="Cart"]').click()`); await waitFor(`location.pathname==='/cart'&&document.body.innerText.includes('Order summary')`, "/cart"); await sleep(1000);
    await clickText("button", "Proceed to checkout"); await waitFor(`document.querySelector('#fullName')`, "form");
    await clickText("button[type=submit]", "Place order"); await waitFor(`document.querySelectorAll('[aria-invalid=true]').length>=5`, "inline errors");
    await fill("#fullName", "E2E Shopper"); await fill("#phone", "98765 43210"); await fill("#address", "12 Rose Lane"); await fill("#city", "Pune"); await fill("#state", "Maharashtra"); await fill("#pincode", "411001");

    if (mode === "mock") {
      await clickText("button[type=submit]", "Place order");
      await waitFor(`!!document.querySelector('[role=dialog]')&&document.body.innerText.includes('Development test payment')`, "clearly-labelled test payment dialog");
      // keyboard: focus starts inside the dialog, Tab / Shift+Tab never escape it, Escape closes it and returns focus
      if (!(await focusInfo()).inDialog) throw new Error("focus did not move into the dialog");
      for (let i = 0; i < 6; i++) { await tab(); const f = await focusInfo(); if (!f.inDialog) throw new Error("Tab escaped the dialog onto: " + f.text); if (!hasFocusIndicator(f)) throw new Error("no focus indicator in dialog on: " + f.text); }
      for (let i = 0; i < 3; i++) { await tab(true); if (!(await focusInfo()).inDialog) throw new Error("Shift+Tab escaped the dialog"); }
      await escape();
      await waitFor(`!document.querySelector('[role=dialog]')`, "Escape closes the dialog");
      await waitFor(`document.activeElement&&document.activeElement.type==='submit'`, "focus returns to the Place order button");
      await clickText("button[type=submit]", "Place order");
      await waitFor(`!!document.querySelector('[role=dialog]')`, "dialog reopened");
      await clickText("[role=dialog] button", "Cancel"); await waitFor(`!document.querySelector('[role=dialog]')&&!document.querySelector('button[type=submit]').disabled`, "cancel re-enables the form");
      await clickText("button[type=submit]", "Place order");
      await waitFor(`!!document.querySelector('[role=dialog]')`, "dialog again");
      await clickText("[role=dialog] button", "Simulate successful payment");
    } else {
      // Stand-in for the Razorpay popup; it "pays" with a signature made from the e2e-only secret.
      await ev(`window.__rzp=null; window.__opened=false; window.Razorpay=function(o){window.__rzp=o; this.on=function(){}; this.open=function(){window.__opened=true}}; true`);
      await clickText("button[type=submit]", "Place order");
      await waitFor(`window.__opened===true`, "Razorpay popup opened");
      const o = JSON.parse(await ev(`JSON.stringify({order_id:window.__rzp.order_id,key:window.__rzp.key,amount:window.__rzp.amount,dismiss:typeof window.__rzp.modal?.ondismiss})`));
      if (!o.order_id || !o.amount || o.dismiss !== "function") throw new Error("bad popup options: " + JSON.stringify(o));
      if (JSON.stringify(o).includes(KEY_SECRET)) throw new Error("key secret leaked to the browser");
      // 1) a forged payment is refused and the order stays unpaid
      await ev(`window.__rzp.handler({razorpay_order_id:${JSON.stringify(o.order_id)},razorpay_payment_id:'pay_forged',razorpay_signature:'signature_here'})`);
      await waitFor(`document.body.innerText.toLowerCase().includes('invalid payment signature')`, "forged payment rejected");
      if (!(await pagePath()).startsWith("/checkout")) throw new Error("left checkout after a forged payment");
      // 2) a genuine signature is accepted
      const sig = crypto.createHmac("sha256", KEY_SECRET).update(`${o.order_id}|pay_e2e_ok`).digest("hex");
      await ev(`window.__rzp.handler({razorpay_order_id:${JSON.stringify(o.order_id)},razorpay_payment_id:'pay_e2e_ok',razorpay_signature:${JSON.stringify(sig)}})`);
    }
    await waitFor(`/^\\/order-success\\/[a-f0-9]{24}$/.test(location.pathname)`, "redirect to order confirmation");
    await waitFor(`document.body.innerText.includes('Thank you')&&document.body.innerText.includes('Paid')`, "confirmation shows Paid");
    if (mode === "mock") await waitFor(`document.body.innerText.includes('Test payment')`, "mock order labelled as a test payment");
  });
  await step("cart is emptied and the order appears in history without admin controls", async () => {
    await waitFor(cartCount(0), "cart 0");
    await clickText("header nav a", "Orders"); await waitFor(`location.pathname==='/orders'&&${cardCount(1)}`, "1 order");
    await waitFor(`!!document.querySelector('[aria-label="Order progress"]')`, "tracker");
    if (await ev(`!!document.querySelector('select[id^=status-]')`)) throw new Error("shoppers must not see status controls");
  });
  await step("page refresh keeps the session; logout blocks protected pages", async () => {
    await send("Page.reload"); await sleep(800); await waitFor(`location.pathname==='/orders'&&${cardCount(1)}`, "still signed in after refresh");
    await clickText("header button", "Log out"); await waitFor(`location.pathname==='/login'`, "/login");
    await goto(APP + "/orders"); await waitFor(`location.pathname==='/login'`, "blocked");
  });
  await step("an expired/invalid session redirects to /login", async () => {
    await goto(APP + "/login"); await fill("#email", email); await fill("#password", "secret1"); await clickText("button[type=submit]", "Log in");
    await waitFor(`location.pathname==='/home'`, "/home");
    await apiFromPage("POST", "/customers/logout"); // the server drops the session behind the app's back
    await clickText("header nav a", "Shop"); await waitFor(`location.pathname==='/login'`, "redirected after session loss");
  });
};

// E2E_JOURNEYS=mock,fake-razorpay (default) lets you run just one part while debugging.
const journeys = (process.env.E2E_JOURNEYS ?? "mock,fake-razorpay").split(",").map((x) => x.trim()).filter(Boolean);
for (const mode of journeys) await journey(mode);

// ---- backend outage on a fresh page load ------------------------------------
console.log("\n=== Resilience ===");
await step("backend down on a cold page load shows a clear message, and Try again recovers", async () => {
  if (!backend) await startBackend("fake-razorpay");
  backend.kill(); await sleep(1000);
  await goto(APP + "/orders");
  await waitFor(`document.body.innerText.includes("Can't reach the server")&&[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Try again'))`, "unreachable message");
  if ((await pagePath()) !== "/orders") throw new Error("must not redirect to /login while the server is merely unreachable");
  await startBackend("fake-razorpay");
  // If the browser had to be relaunched meanwhile, the page was already reloaded against the live API.
  if (await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Try again'))`)) {
    await clickText("button", "Try again");
  }
  await waitFor(`location.pathname==='/login'`, "after recovery, a signed-out visitor is sent to /login");
});

// ---- admin-only controls ----------------------------------------------------
console.log("\n=== Administrator controls ===");
await step("only the administrator sees the order status control, and it works", async () => {
  await goto(APP + "/login");
  await apiFromPage("POST", "/customers/register", { fullName: "E2E Admin", email: "e2e-admin@example.com", password: "secret1", phone: "9876543210" });
  await fill("#email", "e2e-admin@example.com"); await fill("#password", "secret1"); await clickText("button[type=submit]", "Log in");
  await waitFor(`location.pathname==='/home'`, "admin home");
  // the admin buys something so they own a paid order to progress
  await goto(APP + "/products"); await waitFor(cardCount(12), "products");
  await clickText("main article button", "Add to cart"); await waitFor(cartCount(1), "cart");
  await ev(`document.querySelector('header a[aria-label^="Cart"]').click()`); await waitFor(`location.pathname==='/cart'&&document.body.innerText.includes('Order summary')`, "/cart"); await sleep(1000);
  await clickText("button", "Proceed to checkout"); await waitFor(`document.querySelector('#fullName')`, "form");
  await fill("#fullName", "E2E Admin"); await fill("#phone", "9876543210"); await fill("#address", "1 Road"); await fill("#city", "Pune"); await fill("#state", "MH"); await fill("#pincode", "411001");
  await ev(`window.Razorpay=function(o){window.__rzp=o; this.on=function(){}; this.open=function(){window.__opened=true}}; true`);
  await clickText("button[type=submit]", "Place order"); await waitFor(`window.__opened===true`, "popup");
  const oid = await ev(`window.__rzp.order_id`);
  const sig = crypto.createHmac("sha256", KEY_SECRET).update(`${oid}|pay_admin_ok`).digest("hex");
  await ev(`window.__rzp.handler({razorpay_order_id:${JSON.stringify(oid)},razorpay_payment_id:'pay_admin_ok',razorpay_signature:${JSON.stringify(sig)}})`);
  await waitFor(`/^\\/order-success\\//.test(location.pathname)`, "order confirmation");
  await clickText("header nav a", "Orders"); await waitFor(`location.pathname==='/orders'&&!!document.querySelector('select[id^=status-]')`, "admin sees status control");
  await setSelect("select[id^=status-]", "SHIPPED");
  await waitFor(`document.querySelector('main article').innerText.includes('Shipped')`, "status changed to Shipped");
});

console.log(`\n${results.filter((r) => r[0] === "PASS").length} passed, ${failed} failed`);
const unique = [...new Set(consoleProblems)];
if (relaunches > 0) console.log(`\nNOTE: headless Chrome exited by itself and was relaunched ${relaunches} time(s) during this run.`);
console.log(unique.length ? "\nBrowser console errors/warnings:\n" + unique.map((x) => "  " + x).join("\n") : "\nBrowser console: no errors or warnings recorded");

await shutdown();
process.exit(failed || unique.length ? 1 : 0);

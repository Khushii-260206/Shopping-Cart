import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../index.js", import.meta.url));
// dotenv reads ".env" from the working directory, so run from an empty folder: the developer's
// real Backend/.env must never influence (or be started by) these tests.
const EMPTY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "shopkart-startup-"));
test.after(() => fs.rmSync(EMPTY_DIR, { recursive: true, force: true }));

// Fake credentials, assembled at runtime so no connection-string literal sits in the repo
// (keeps public secret scanners quiet). They exist only to prove they are never printed.
const FAKE_USER = "fakeuser";
const FAKE_PASS = "fakepass";
const fakeUri = (host) => ["mongodb:", "//", FAKE_USER, ":", FAKE_PASS, "@", host].join("");

// Starts the real server entry point with a controlled environment (no .env values involved).
const start = (env, timeout = 30000) =>
  spawnSync("node", [ENTRY], {
    cwd: EMPTY_DIR,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: "utf8",
    timeout,
  });

test("startup: missing configuration stops the server and names the variables", () => {
  const result = start({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MONGODB_URI/);
  assert.match(result.stderr, /JWT_SECRET/);
});

test("startup: an invalid setting is rejected without echoing secret values", () => {
  const result = start({ MONGODB_URI: fakeUri("127.0.0.1:1/x"), JWT_SECRET: "short", PORT: "nope" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JWT_SECRET/);
  assert.match(result.stderr, /PORT/);
  assert.doesNotMatch(result.stderr + result.stdout, new RegExp(FAKE_PASS));
});

test("startup: mock payments are refused in production", () => {
  const result = start({
    MONGODB_URI: "mongodb://127.0.0.1:1/x",
    JWT_SECRET: "a-sufficiently-long-secret",
    NODE_ENV: "production",
    ALLOW_MOCK_PAYMENTS: "true",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ALLOW_MOCK_PAYMENTS/);
});

test("startup: an unreachable database gives a clear message and never leaks the connection string", () => {
  const result = start({
    MONGODB_URI: fakeUri("127.0.0.1:1/shopkart"),
    JWT_SECRET: "a-sufficiently-long-secret",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not connect to MongoDB/);
  assert.doesNotMatch(result.stderr + result.stdout, new RegExp(`${FAKE_USER}|${FAKE_PASS}`));
});

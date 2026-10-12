import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import mongoose from "mongoose";

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });

// Provides a throwaway database for tests. Order of preference:
//   1. TEST_MONGODB_URI (a server you control; a unique database name is used), or
//   2. a temporary local `mongod` started from PATH, deleted afterwards.
// Returns null when neither is available so the DB tests can skip with a clear reason.
export async function startTestDatabase() {
  const dbName = `shopkart_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let child = null;
  let dir = null;
  let uri;

  if (process.env.TEST_MONGODB_URI) {
    uri = process.env.TEST_MONGODB_URI.replace(/\/?(\?.*)?$/, `/${dbName}$1`);
  } else {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopkart-mongo-"));
    const port = await freePort();
    child = spawn("mongod", ["--dbpath", dir, "--port", String(port), "--bind_ip", "127.0.0.1"], {
      stdio: "ignore",
    });
    const spawnFailed = await new Promise((resolve) => {
      child.once("error", () => resolve(true));
      setTimeout(() => resolve(false), 400);
    });
    if (spawnFailed) {
      fs.rmSync(dir, { recursive: true, force: true });
      return null;
    }
    uri = `mongodb://127.0.0.1:${port}/${dbName}`;
  }

  // mongod needs a moment before it accepts connections.
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (lastError) {
    child?.kill();
    return null;
  }

  return {
    uri,
    async stop() {
      // Only ever drops the unique database created above.
      if (mongoose.connection.name.startsWith("shopkart_test_")) {
        await mongoose.connection.dropDatabase();
      }
      await mongoose.disconnect();
      if (child) {
        child.kill();
        await new Promise((r) => setTimeout(r, 200));
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

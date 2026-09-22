/**
 * Starts the backend against a local MongoDB that this script manages
 * itself, so development needs no MongoDB install and no Atlas account.
 *
 * Unlike the throwaway database in verify.js, this one persists to
 * backend/.mongo-data — admin accounts, leads and testimonials survive a
 * restart. The first run downloads a MongoDB binary (~100MB, cached in your
 * user profile); later runs start in a second or two.
 *
 * This is a development convenience only. For production set MONGODB_URI to
 * a real database (Atlas or self-hosted) and run `npm start`.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(backendDir, ".mongo-data");
mkdirSync(dbPath, { recursive: true });

console.log("Starting local MongoDB…");
console.log("  (first run downloads a MongoDB binary — this can take a minute)");

const mongo = await MongoMemoryServer.create({
  instance: {
    dbName: "snuggs-huggs",
    dbPath,
    // Fixed port, not the library's random default: `npm run
    // create-admin:local` runs in a separate process and has to reach this
    // same database. A random port would silently give it a different one.
    // 27018 avoids clashing with a real local mongod on 27017.
    port: 27018,
    // Without this the data directory is wiped on shutdown, which would
    // mean re-creating the admin user on every restart.
    storageEngine: "wiredTiger",
  },
});

const uri = mongo.getUri("snuggs-huggs");
process.env.MONGODB_URI = uri;

console.log(`Local MongoDB ready  ${uri}`);
console.log(`  data stored in     backend/.mongo-data\n`);

// Imported only after MONGODB_URI is set — config/env.js reads it at import
// time and exits if it's missing.
await import("../src/server.js");

async function stop(signal) {
  console.log(`\n${signal} — stopping local MongoDB…`);
  try {
    await mongo.stop();
  } catch {
    // Already gone; nothing to do.
  }
  process.exit(0);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

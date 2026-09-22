import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { createApp } from "./app.js";
import { migrateLegacyAdminRoles } from "./models/AdminUser.js";

const app = createApp();

await connectDb();
await migrateLegacyAdminRoles();

const server = app.listen(env.PORT, () => {
  console.log(`\nSnuggs & Huggs backend`);
  console.log(`  API    http://localhost:${env.PORT}/api`);
  console.log(`  Admin  http://localhost:${env.PORT}/admin`);
  console.log(`  Env    ${env.NODE_ENV}\n`);
});

/**
 * Finish in-flight requests before exiting, so a deploy doesn't drop a lead
 * mid-submission. The timer is a backstop for a connection that never
 * closes on its own.
 */
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down…`);
  const force = setTimeout(() => {
    console.error("Forced exit after 10s");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    await disconnectDb();
    clearTimeout(force);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

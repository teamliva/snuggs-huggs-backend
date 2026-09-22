import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { connectDb, disconnectDb } from "../config/db.js";
import { AdminUser } from "../models/AdminUser.js";

/**
 * Creates (or resets the password of) an admin account.
 *
 * Two modes:
 *  - Interactive (default): prompts for everything. Preferred, because the
 *    password never lands in shell history.
 *  - Non-interactive: set ADMIN_EMAIL and ADMIN_PASSWORD. Used for scripted
 *    provisioning and first-run setup. Deliberately environment variables
 *    rather than CLI flags — argv is visible in the process list.
 */
const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const envPassword = process.env.ADMIN_PASSWORD;

if (envEmail && envPassword) {
  try {
    await connectDb();

    if (envPassword.length < 12) {
      console.error("ADMIN_PASSWORD must be at least 12 characters.");
      process.exit(1);
    }

    const passwordHash = await AdminUser.hashPassword(envPassword);
    const existing = await AdminUser.findOne({ email: envEmail });

    if (existing) {
      existing.passwordHash = passwordHash;
      if (process.env.ADMIN_NAME) existing.name = process.env.ADMIN_NAME;
      await existing.save();
      console.log(`Password reset for ${envEmail}`);
    } else {
      await AdminUser.create({
        email: envEmail,
        name: process.env.ADMIN_NAME || "",
        // The CLI is the bootstrap path, so it creates full admins.
        role: "admin",
        passwordHash,
      });
      console.log(`Admin created: ${envEmail}`);
    }
  } catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }

  process.exit(process.exitCode ?? 0);
}

const rl = readline.createInterface({ input: stdin, output: stdout });

try {
  await connectDb();

  const email = (await rl.question("Admin email: ")).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("That doesn't look like a valid email address.");
    process.exit(1);
  }

  const name = (await rl.question("Display name (optional): ")).trim();

  const password = await rl.question("Password (min 12 characters): ");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const confirm = await rl.question("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords don't match.");
    process.exit(1);
  }

  const passwordHash = await AdminUser.hashPassword(password);
  const existing = await AdminUser.findOne({ email });

  if (existing) {
    const replace = (
      await rl.question(`${email} already exists. Reset its password? (y/N) `)
    )
      .trim()
      .toLowerCase();

    if (replace !== "y") {
      console.log("Cancelled.");
      process.exit(0);
    }

    existing.passwordHash = passwordHash;
    if (name) existing.name = name;
    await existing.save();
    console.log(`\nPassword updated for ${email}.`);
  } else {
    await AdminUser.create({ email, name, role: "admin", passwordHash });
    console.log(`\nAdmin created: ${email}`);
  }

  console.log("Sign in at http://localhost:4000/admin\n");
} catch (err) {
  console.error("\nFailed:", err.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await disconnectDb();
}

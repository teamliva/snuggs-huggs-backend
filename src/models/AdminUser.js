import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES } from "../auth/permissions.js";

const adminUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    name: { type: String, trim: true, maxlength: 120, default: "" },

    // Accounts created before roles existed have no `role` field; a boot
    // migration (see server.js) promotes them to admin, since every account
    // had full access at that point. New accounts default to the least
    // privileged role.
    role: { type: String, enum: ROLES, default: "author", index: true },

    // Never stores the password itself — only the bcrypt hash. `select:
    // false` keeps it out of every query result unless explicitly asked
    // for, so it can't leak through a careless res.json(user).
    passwordHash: { type: String, required: true, select: false },

    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

/** Hashes a plaintext password. Cost 12 ~ 250ms, deliberate. */
adminUserSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 12);
};

adminUserSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const AdminUser = mongoose.model("AdminUser", adminUserSchema);

/** One-time, idempotent: pre-role accounts become admins. */
export async function migrateLegacyAdminRoles() {
  const res = await AdminUser.collection.updateMany(
    { role: { $exists: false } },
    { $set: { role: "admin" } }
  );
  if (res.modifiedCount) {
    console.log(`Assigned admin role to ${res.modifiedCount} existing account(s)`);
  }
}

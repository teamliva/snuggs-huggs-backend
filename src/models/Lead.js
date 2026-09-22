import mongoose from "mongoose";

/**
 * A consultation enquiry from the website form.
 *
 * This is the record of someone asking for help with a parent — treat it as
 * sensitive. Only ever expose it behind admin auth, and keep the shape
 * minimal: collect what's needed to call them back, nothing more. Deliberately
 * no health details, no date of birth, no address.
 */
const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },

    // Free-text: "who is the care for / what do you need".
    message: { type: String, trim: true, maxlength: 4000 },

    // Which care level they were looking at when they enquired, if any.
    carePlan: {
      type: String,
      enum: ["Standard Care", "Premium Care", "All-Inclusive", "Not sure"],
      default: "Not sure",
    },

    preferredContact: {
      type: String,
      enum: ["phone", "email"],
      default: "phone",
    },

    status: {
      type: String,
      enum: ["new", "contacted", "consultation_booked", "closed", "spam"],
      default: "new",
      index: true,
    },

    // Internal follow-up notes. Never returned by any public endpoint.
    notes: { type: String, trim: true, maxlength: 4000, default: "" },

    // Kept for spam triage only.
    meta: {
      ip: { type: String, maxlength: 60 },
      userAgent: { type: String, maxlength: 400 },
      source: { type: String, maxlength: 120, default: "website" },
    },
  },
  { timestamps: true }
);

// The admin list is "newest first", optionally filtered by status.
leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });

export const Lead = mongoose.model("Lead", leadSchema);

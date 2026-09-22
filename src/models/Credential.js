import mongoose from "mongoose";

/**
 * Fills the CREDENTIALS array the website currently renders as empty —
 * licence numbers, bonded/insured status, accreditations.
 *
 * These are the strongest trust signals a home care site has, and also the
 * easiest to get wrong: publishing a licence number that has lapsed, or an
 * accreditation that was never held, is a regulatory problem rather than a
 * marketing one. `published` defaults to false so nothing reaches the site
 * until it has been checked.
 */
const credentialSchema = new mongoose.Schema(
  {
    // Icon name from the website's registry (src/components/icons.js),
    // e.g. "ShieldCheck". Validated against that list in the admin UI.
    icon: { type: String, trim: true, maxlength: 60, default: "ShieldCheck" },

    // e.g. "Licensed in Washington"
    label: { type: String, required: true, trim: true, maxlength: 160 },

    // e.g. the licence number, or the issuing body.
    detail: { type: String, trim: true, maxlength: 240, default: "" },

    // Optional expiry, so a lapsed licence can be spotted before a family
    // asks about it.
    expiresOn: { type: Date },

    published: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

credentialSchema.index({ published: 1, sortOrder: 1 });

/** True when an expiry date is set and already in the past. */
credentialSchema.virtual("isExpired").get(function () {
  return Boolean(this.expiresOn && this.expiresOn.getTime() < Date.now());
});

credentialSchema.set("toJSON", { virtuals: true });
credentialSchema.set("toObject", { virtuals: true });

export const Credential = mongoose.model("Credential", credentialSchema);

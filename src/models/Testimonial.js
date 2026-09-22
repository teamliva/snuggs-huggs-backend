import mongoose from "mongoose";

/**
 * Fills the TESTIMONIALS array the website currently renders as empty.
 *
 * `published` defaults to false on purpose: a testimonial should only go
 * live once someone has confirmed permission to publish it. `consentOnFile`
 * records that confirmation explicitly, because publishing a client's words
 * about their parent's care without permission is a real problem, not a
 * paperwork detail.
 */
const testimonialSchema = new mongoose.Schema(
  {
    quote: { type: String, required: true, trim: true, maxlength: 1200 },
    name: { type: String, required: true, trim: true, maxlength: 120 },

    // e.g. "Daughter of a client"
    relation: { type: String, trim: true, maxlength: 160, default: "" },

    rating: { type: Number, min: 1, max: 5, default: 5 },

    published: { type: Boolean, default: false, index: true },
    consentOnFile: { type: Boolean, default: false },

    // Manual ordering on the site; lower shows first.
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

testimonialSchema.index({ published: 1, sortOrder: 1, createdAt: -1 });

export const Testimonial = mongoose.model("Testimonial", testimonialSchema);

import { z } from "zod";
import { HttpError } from "./middleware/errors.js";

/** Runs a zod schema and throws a 400 with field-level detail on failure. */
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!details[key]) details[key] = issue.message;
  }
  throw new HttpError(400, "Please check the highlighted fields", details);
}

// Permissive on purpose: people write numbers as "(206) 848-5121",
// "206.848.5121", "+1 206 848 5121". Requiring a strict format rejects real
// enquiries, which costs far more than accepting a messy string.
const phone = z
  .string()
  .trim()
  .min(7, "Please enter a phone number we can reach you on")
  .max(40)
  .regex(/^[\d\s()+.\-x]+$/i, "Please enter a valid phone number");

export const leadCreateSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address")
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z.string().trim().max(4000).optional(),
  carePlan: z
    .enum(["Standard Care", "Premium Care", "All-Inclusive", "Not sure"])
    .default("Not sure"),
  preferredContact: z.enum(["phone", "email"]).default("phone"),

  // Honeypot. Real users never see this field, so anything in it is a bot.
  // Named innocuously because bots skip fields called "honeypot".
  //
  // Deliberately accepted by validation rather than rejected: a 400 here
  // would tell the bot exactly which field tripped it and let it retry
  // without that field. The route accepts the request, returns 201, and
  // silently discards it instead.
  company: z.string().max(200).optional(),
});

export const leadUpdateSchema = z.object({
  status: z.enum(["new", "contacted", "consultation_booked", "closed", "spam"]).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

export const testimonialSchema = z.object({
  quote: z.string().trim().min(10, "Quote is too short").max(1200),
  name: z.string().trim().min(2, "Name is required").max(120),
  relation: z.string().trim().max(160).optional().default(""),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  published: z.coerce.boolean().default(false),
  consentOnFile: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

export const credentialSchema = z.object({
  icon: z.string().trim().max(60).default("ShieldCheck"),
  label: z.string().trim().min(2, "Label is required").max(160),
  detail: z.string().trim().max(240).optional().default(""),
  expiresOn: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => (v ? new Date(v) : undefined)),
  published: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

/**
 * The website's non-blog destinations, for internal-link suggestions.
 *
 * Mirrors the real sections of the homepage (src/data/site.js on the
 * frontend). `terms` are the topics each section actually covers — used
 * only to rank suggestions, never shown to readers.
 */
export const SITE_PAGES = [
  {
    title: "Free care consultation",
    url: "/#consultation",
    type: "conversion",
    terms: ["consultation", "free consultation", "get started", "call", "talk", "contact", "help", "next step"],
  },
  {
    title: "In-home care services",
    url: "/#services",
    type: "service",
    terms: ["personal care", "bathing", "dressing", "hygiene", "meal", "grocery", "medication reminders", "companionship", "home management", "appointments", "daily routines"],
  },
  {
    title: "Care options and plans",
    url: "/#care",
    type: "service",
    terms: ["care plan", "standard care", "premium care", "all-inclusive", "cost", "pricing", "level of care", "options"],
  },
  {
    title: "Compare care plans",
    url: "/#compare",
    type: "service",
    terms: ["compare", "plans", "what is included", "difference"],
  },
  {
    title: "Dementia & memory care support",
    url: "/#specialties",
    type: "service",
    terms: ["dementia", "memory care", "alzheimer", "alzheimer's", "memory loss", "cognitive", "confusion"],
  },
  {
    title: "How caregiver matching works",
    url: "/#matching",
    type: "service",
    terms: ["caregiver matching", "choose a caregiver", "trial", "introductions", "finding a caregiver", "match"],
  },
  {
    title: "About Snuggs & Huggs",
    url: "/#about",
    type: "page",
    terms: ["about", "founder", "values", "who we are", "compassionate"],
  },
  {
    title: "Frequently asked questions",
    url: "/#faq",
    type: "page",
    terms: ["faq", "questions", "service area", "seattle", "how much", "24/7"],
  },
];

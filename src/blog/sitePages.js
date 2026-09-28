/**
 * The website's non-blog destinations, for internal-link suggestions.
 *
 * Mirrors the real pages and homepage sections of the frontend
 * (src/data/site.js and src/data/services.js). Service pages come first so
 * articles link to the page built to rank for that topic rather than a
 * homepage anchor. `terms` are the topics each page actually covers — used
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
    title: "In-home personal care",
    url: "/services/personal-care",
    type: "service",
    terms: ["personal care", "bathing", "shower", "dressing", "hygiene", "grooming", "toileting", "incontinence", "dignity"],
  },
  {
    title: "Companion care for seniors",
    url: "/services/companion-care",
    type: "service",
    terms: ["companion", "companionship", "loneliness", "lonely", "isolation", "activities", "recreation", "social", "engagement"],
  },
  {
    title: "In-home dementia & memory care",
    url: "/services/dementia-care",
    type: "service",
    terms: ["dementia", "memory care", "alzheimer", "alzheimer's", "memory loss", "cognitive", "confusion", "wandering"],
  },
  {
    title: "Homemaker services",
    url: "/services/homemaker-services",
    type: "service",
    terms: ["meal", "meals", "cooking", "grocery", "groceries", "errands", "housekeeping", "home management", "medication reminders", "daily routines"],
  },
  {
    title: "Care coordination & family updates",
    url: "/services/care-coordination",
    type: "service",
    terms: ["care coordination", "appointments", "doctor", "transportation", "care plan", "family updates", "long-distance", "out of state", "care conference"],
  },
  {
    title: "All in-home care services",
    url: "/services",
    type: "service",
    terms: ["in-home care", "home care", "senior care", "services", "caregiver"],
  },
  {
    title: "Care options and plans",
    url: "/#care",
    type: "service",
    terms: ["standard care", "premium care", "all-inclusive", "cost", "pricing", "level of care", "options"],
  },
  {
    title: "Compare care plans",
    url: "/#compare",
    type: "service",
    terms: ["compare", "plans", "what is included", "difference"],
  },
  {
    title: "How caregiver matching works",
    url: "/#matching",
    type: "service",
    terms: ["caregiver matching", "choose a caregiver", "trial", "introductions", "finding a caregiver", "match"],
  },
  {
    title: "About Snuggs & Huggs and founder Michelle Wiley",
    url: "/about",
    type: "page",
    terms: ["about", "founder", "michelle", "values", "who we are", "compassionate"],
  },
  {
    title: "Contact Snuggs & Huggs",
    url: "/contact",
    type: "page",
    terms: ["contact", "phone number", "call us", "get in touch", "reach us", "service area"],
  },
  {
    title: "Frequently asked questions",
    url: "/faq",
    type: "page",
    terms: ["faq", "questions", "service area", "seattle", "how much", "24/7", "non-medical", "home health"],
  },
  {
    title: "Caregiver careers at Snuggs & Huggs",
    url: "/careers",
    type: "page",
    terms: ["careers", "jobs", "hiring", "caregiver jobs", "apply", "join the team", "work for us", "employment"],
  },
];

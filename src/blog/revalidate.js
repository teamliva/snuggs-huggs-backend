import { env } from "../config/env.js";

/**
 * Tells the Next.js frontend to refresh cached blog pages right away
 * instead of waiting for its revalidation timer. Fire-and-forget: a failed
 * notification only means the page updates a couple of minutes later, so
 * it must never fail the save that triggered it.
 *
 * @param {string[]} tags  Cache tags to invalidate, e.g. ["blog", "post:my-slug"]
 */
export async function revalidateFrontend(tags) {
  if (!env.REVALIDATE_SECRET || !env.FRONTEND_URL) return;
  try {
    const res = await fetch(`${env.FRONTEND_URL}/api/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": env.REVALIDATE_SECRET,
      },
      body: JSON.stringify({ tags: [...new Set(tags)] }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.warn(`Frontend revalidation returned ${res.status}`);
  } catch (err) {
    console.warn(`Frontend revalidation skipped: ${err.message}`);
  }
}

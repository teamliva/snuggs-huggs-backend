/**
 * Role-based permissions. One table, checked server-side on every
 * mutating route — the admin UI hides buttons a role can't use, but hiding
 * is cosmetic; this is what actually enforces it.
 *
 *   admin   Everything, including enquiries (client PII) and user accounts.
 *   editor  Runs the blog: publishes anyone's posts, manages taxonomy and
 *           media, edits testimonials/credentials. No enquiries, no users.
 *   author  Writes and edits their OWN posts as drafts. Cannot publish,
 *           delete published content, or touch taxonomy beyond existing tags.
 *
 * @typedef {"admin" | "editor" | "author"} Role
 * @typedef {{ id: string, email: string, name: string, role: Role }} SessionUser
 */

export const ROLES = /** @type {const} */ (["admin", "editor", "author"]);

/** @type {Record<string, Role[]>} */
const MATRIX = {
  "leads.manage": ["admin"],
  "users.manage": ["admin"],
  "content.manage": ["admin", "editor"], // testimonials, credentials

  "posts.create": ["admin", "editor", "author"],
  "posts.editAny": ["admin", "editor"],
  "posts.publish": ["admin", "editor"],
  "posts.delete": ["admin", "editor"],

  "taxonomy.manage": ["admin", "editor"], // categories, tags, authors
  "media.upload": ["admin", "editor", "author"],
  "media.delete": ["admin", "editor"],
};

/**
 * @param {SessionUser | undefined} user
 * @param {keyof typeof MATRIX} action
 */
export function can(user, action) {
  if (!user) return false;
  return (MATRIX[action] || []).includes(user.role);
}

/**
 * Whether `user` may edit `post`. Authors may only edit posts they created,
 * and only while those posts are unpublished — otherwise an author could
 * silently change live content an editor approved.
 */
export function canEditPost(user, post) {
  if (can(user, "posts.editAny")) return true;
  if (!user || user.role !== "author") return false;
  const owner = String(post.createdBy || "");
  return owner === String(user.id) && post.status !== "published";
}

export function canDeletePost(user, post) {
  if (can(user, "posts.delete")) return true;
  // Authors may discard their own drafts.
  return canEditPost(user, post) && post.status === "draft";
}

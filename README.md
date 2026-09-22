# Snuggs & Huggs — Backend

Lead capture API and admin dashboard for the Snuggs & Huggs website.

Express + MongoDB (Mongoose). The admin dashboard is server-rendered (EJS),
so there is no second build step and no separate frontend to deploy — the
whole backend is one process.

## What it does

1. **Captures consultation enquiries** from the website form — validated,
   stored, and emailed to the office.
2. **Admin dashboard** at `/admin` to read and work through those enquiries
   (status, follow-up notes).
3. **Manages the two empty sections on the website** — Testimonials and
   Credentials — which the site currently renders as nothing because
   `src/data/site.js` has empty arrays.

## Setup

```bash
cd backend
npm install
cp .env.example .env     # then edit it
npm run create-admin     # interactive: creates your login
npm run dev              # http://localhost:4000/admin
```

You need a MongoDB connection string in `.env`. Either:

- **MongoDB Atlas** (free tier, nothing to install) — create a cluster, then
  use the `mongodb+srv://…` string.
- **Local install** — `mongodb://127.0.0.1:27017/snuggs-huggs`.

Generate a `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Verify it works

```bash
npm run verify
```

Runs 19 end-to-end checks against a real HTTP server backed by an in-memory
MongoDB. Needs no database of your own and writes nothing to one. Covers
validation, the honeypot, auth, session cookie flags, admin access control,
published/unpublished filtering, and every admin page.

## Layout

```
backend/
├── .env.example
├── scripts/verify.js          end-to-end smoke test (in-memory Mongo)
└── src/
    ├── server.js              entry point, graceful shutdown
    ├── app.js                 express wiring, helmet/cors/body limits
    ├── validation.js          all zod schemas
    ├── config/
    │   ├── env.js             validates env at boot, exits on bad config
    │   └── db.js              mongoose connection
    ├── models/                Lead, Testimonial, Credential, AdminUser
    ├── middleware/
    │   ├── auth.js            JWT session cookie, route guards
    │   └── errors.js          asyncHandler, HttpError, error handler
    ├── routes/
    │   ├── api.js             JSON API (public + admin)
    │   └── admin.js           server-rendered dashboard
    ├── services/mailer.js     lead notification email (optional)
    ├── views/                 EJS templates
    └── scripts/createAdmin.js
```

## API

### Public — no auth

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/leads` | Submit a consultation enquiry |
| `GET` | `/api/testimonials` | Published testimonials only |
| `GET` | `/api/credentials` | Published credentials only |
| `GET` | `/health` | Liveness check |

`POST /api/leads` body:

```json
{
  "name": "Karen Miller",
  "phone": "(206) 555-0142",
  "email": "karen@example.com",
  "message": "Looking for help for my mother, three mornings a week.",
  "carePlan": "Premium Care",
  "preferredContact": "phone"
}
```

Only `name` and `phone` are required. `carePlan` is one of `Standard Care`,
`Premium Care`, `All-Inclusive`, `Not sure`.

Validation failures return `400` with per-field messages:

```json
{ "error": "Please check the highlighted fields",
  "details": { "phone": "Please enter a phone number we can reach you on" } }
```

### Admin — requires session

`POST /api/auth/login` → sets an HttpOnly cookie. Then:

| Method | Path |
| --- | --- |
| `GET` | `/api/admin/leads?status=new&page=1` |
| `GET` `PATCH` `DELETE` | `/api/admin/leads/:id` |
| `GET` `POST` | `/api/admin/testimonials` |
| `PATCH` `DELETE` | `/api/admin/testimonials/:id` |
| `GET` `POST` | `/api/admin/credentials` |
| `PATCH` `DELETE` | `/api/admin/credentials/:id` |

## Security notes

- **Passwords** are bcrypt-hashed at cost 12. The hash column is
  `select: false`, so it can't leak through a careless `res.json(user)`.
- **Sessions** are JWTs in an HttpOnly, SameSite=Lax cookie — not readable
  by page JavaScript, and not sent on cross-site POSTs.
- **Login** returns the same message and does the same work whether the
  account is missing or the password is wrong, so responses don't reveal
  which email addresses exist.
- **Rate limits**: 8 lead submissions and 10 login attempts per IP per 15
  minutes.
- **Honeypot**: a hidden `company` field. Anything that fills it gets a
  `201` and is silently discarded — deliberately *not* a `400`, which would
  tell a bot which field tripped it.
- **Body size** capped at 64 kB.
- **CORS** is an allowlist from `CORS_ORIGINS`.
- **Lead records are sensitive** — they're someone asking for help with a
  parent. The schema collects only what's needed to call them back: no
  health details, no date of birth, no address. Internal `notes` are never
  returned by any public endpoint.

## Email is optional

If `SMTP_HOST` and `MAIL_TO` are unset, a new lead is still saved — it's
logged to the console instead of emailed. The notification is deliberately
non-fatal: a mail outage must never turn a captured lead into an error for
the family that submitted it.

For Hostinger:

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@snuggsandhuggsseniorservices.com
SMTP_PASS=…
MAIL_TO=you@snuggsandhuggsseniorservices.com
```

## Not done yet

The **website still has no form** — this backend has nothing calling it.
That's the next step: a consultation form in the Next.js app posting to
`POST /api/leads`, and the site reading testimonials/credentials from this
API instead of the empty arrays in `src/data/site.js`.

Also worth knowing:

- There's **no CSRF token** on the admin forms. `SameSite=Lax` covers the
  realistic cases for a single-admin dashboard, but add one if the admin
  ever gets multiple users or moves to a different domain than the API.
- Deleting a lead is permanent — no soft-delete or audit trail.
- No automated backups. With Atlas you get them on paid tiers; on a local
  install, schedule `mongodump`.

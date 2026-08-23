---
name: Auth and secrets
description: How authentication works and which secrets are required
---

Session-based auth via `express-session` with PostgreSQL-backed storage. Two
required Replit Secrets:
- `SESSION_SECRET` — signs the session cookie
- `APP_PASSWORD` — the single password the client uses to log in

APP_PASSWORD is read on every login attempt (not cached at startup), so changing it in Replit Secrets takes effect immediately without a server restart.

**Why:** Single-user private app; no user accounts needed. Session cookie is
httpOnly, sameSite strict, 7-day expiry. Autoscale requests may reach different
instances, so the default in-memory session store causes valid sign-ins to
appear randomly unauthenticated.

**How to apply:** Keep session state in the shared PostgreSQL store and retain
proxy trust for secure production cookies. All `/api/*` routes except
`/api/auth/*` are protected by `requireAuth` middleware in `server/app.js`.

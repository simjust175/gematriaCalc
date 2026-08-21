---
name: Auth and secrets
description: How authentication works and which secrets are required
---

Session-based auth via `express-session`. Two required Replit Secrets:
- `SESSION_SECRET` — signs the session cookie
- `APP_PASSWORD` — the single password the client uses to log in

APP_PASSWORD is read on every login attempt (not cached at startup), so changing it in Replit Secrets takes effect immediately without a server restart.

**Why:** Single-user private app; no user accounts needed. Session cookie is httpOnly, sameSite strict, 7-day expiry.

**How to apply:** All `/api/*` routes except `/api/auth/*` are protected by `requireAuth` middleware in `server/app.js`.

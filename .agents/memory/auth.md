---
name: Auth and secrets
description: How authentication works and which secrets are required
---

Session-based auth via `express-session` with PostgreSQL-backed storage. The
existing password login resolves to one hidden `legacy-private-client` account;
normal accounts use salted scrypt password hashes. Required Replit Secrets:
- `SESSION_SECRET` — signs the session cookie
- `APP_PASSWORD` — the single password the client uses to log in

APP_PASSWORD is read on every login attempt (not cached at startup), so changing it in Replit Secrets takes effect immediately without a server restart.

The legacy account has explicit `legacy_unlimited` active entitlement with
`is_unlimited` and `billing_exempt` enabled. Public signup is disabled unless
the explicit `PUBLIC_SIGNUP_ENABLED=true` feature flag is enabled. Sessions are
httpOnly, sameSite strict, PostgreSQL-backed, rolling, and 30 days by default.

**Why:** The legacy client must keep the password screen and workflow while
private data is isolated for future accounts. Autoscale requests may reach
different instances, so the default in-memory session store causes valid
sign-ins to appear randomly unauthenticated.

**How to apply:** Keep session state in the shared PostgreSQL store and retain
proxy trust for secure production cookies. All `/api/*` routes except
`/api/auth/*` are protected by `requireAuth` middleware in `server/app.js`.

---
name: Request database routing
description: Fail-closed rules for keeping legacy and standard-account database traffic isolated.
---

Authenticated private database work must run inside request-scoped database context. The routed pool must fail when that context is absent rather than silently using the legacy database. Any owner-scoped process cache must include both database role and owner ID, and routed transaction clients must retain the selected role.

The permanent legacy client and owner-aware standard-user API use separate Express sub-apps selected by auth route or session prefix. Legacy private queries remain in their original global-schema modules; standard-user queries use owner-aware modules and `MULTI_USER_DATABASE_URL`. Tefillot is stored only in the multi-user database and may be read by a legacy-authenticated request through an explicit content route.

**Why:** Legacy and standard databases may contain identical numeric owner IDs. A fallback, shared owner-aware query module, or owner-only cache key can read, write, or reuse state across account roles. The legacy production database must remain permanently free of account, ownership, and Tefillot schema.

**How to apply:** Keep startup read-only for both roles. Run schema setup and corpus imports only through explicit commands that require `MULTI_USER_DATABASE_URL`. Never restore session-table auto-creation or route owner-aware helpers to `DATABASE_URL`.
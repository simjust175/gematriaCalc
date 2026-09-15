---
name: Request database routing
description: Fail-closed rules for keeping legacy and standard-account database traffic isolated.
---

Authenticated private database work must run inside request-scoped database context. The routed pool must fail when that context is absent rather than silently using the legacy database. Any owner-scoped process cache must include both database role and owner ID, and routed transaction clients must retain the selected role.

**Why:** Legacy and standard databases may contain identical numeric owner IDs. A fallback or owner-only cache key can read, write, or reuse state across account roles.

**How to apply:** Wrap authenticated route dispatch in request database context, keep auth/session routing explicit, and test concurrent legacy and multi-user requests with colliding owner IDs.
---
name: Stack and architecture
description: Core tech stack, ports, and how frontend/backend connect
---

Vue 3 + Vuetify 3 + Vite on port 5000. Express API on port 3001, proxied via Vite at `/api` (same-origin, no CORS needed). PostgreSQL via Replit built-in (`pg` package). `better-sqlite3` failed native compilation — do not attempt it.

**Why:** Vite proxy keeps all browser requests same-origin; port 3001 must NOT be mapped externally (security).

**How to apply:** Keep API calls as relative URLs (`/api/...`) in frontend code; never hardcode localhost:3001 in browser code.

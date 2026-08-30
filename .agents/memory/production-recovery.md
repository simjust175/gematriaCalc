---
name: Production recovery
description: Verified production PostgreSQL recovery capability for safe schema publishes.
---

The production PostgreSQL database has a configured seven-day point-in-time restore window, usable by selecting a timestamp in the Database tool's restore settings.

**Why:** Schema changes for this app are intentionally applied through Publish, so a verified recovery point is the required safety gate before future production migrations.

**How to apply:** Before any production schema publish, re-check that the configured restore window still covers a usable pre-change timestamp; do not treat the retention maximum as the configured value.
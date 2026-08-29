---
name: Saved-entry integrity
description: Rules for saving and backfilling gematria entries
---

Saved-entry calculations are derived server-side from `originalText`; browser-submitted normalized text, gematria values, initials, and word breakdowns are display hints only and must not be trusted for persistence.

**Why:** This preserves a consistent database even if a browser payload is stale or manipulated, and ensures matching uses canonical persisted initials data.

**How to apply:** The saved-entry API derives full gematria, Hebrew numerals, initials, initials gematria, and words from the source text inside one database transaction. Startup must not rewrite existing rows; any integrity repair is an explicit, separately audited maintenance operation.
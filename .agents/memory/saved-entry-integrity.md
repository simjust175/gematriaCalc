---
name: Saved-entry integrity
description: Rules for saving and backfilling gematria entries
---

Saved-entry calculations are derived server-side from `originalText`; browser-submitted normalized text, gematria values, initials, and word breakdowns are display hints only and must not be trusted for persistence.

**Why:** This preserves a consistent database even if a browser payload is stale or manipulated, and ensures matching uses canonical persisted initials data.

For Tanach entries, every save path—including save-all actions—must verify the cited occurrence against the canonical local corpus and persist calculations from the canonical pointed range, not browser text. Regular saves record primary-only מילוי provenance; save-all records all common forms on that same cited entry.

**How to apply:** The saved-entry API derives full gematria, Hebrew numerals, initials, initials gematria, and words from the source text inside one database transaction. Reuse the same canonical Tanach context verifier for every endpoint that can create or find a cited saved entry. Startup must not rewrite existing rows; any integrity repair is an explicit, separately audited maintenance operation.
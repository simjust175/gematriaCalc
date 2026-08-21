---
name: Matching behavior
description: How live gematria matching works and what was verified
---

Matching is entirely server-side. The client sends `gematria`, `initialsGematria`, and `normalizedText` to `GET /api/matches` (debounced 350ms). The server returns `{ primary, secondary, isAlreadySaved }`.

**Primary matches** = entries whose `full_gematria` equals the current value, PLUS individual words from `saved_words` whose `gematria` matches (with parent-phrase suppression to avoid duplicates).

**Secondary matches** = entries whose persisted `initials_gematria` equals the current live **full** gematria. The client intentionally sends the current full value in the `initialsGematria` request parameter for this comparison. The secondary section in `MatchPanel.vue` is hidden entirely when `secondary.length === 0` — it does NOT show "אין התאמות".

**Verified scenarios (against live DB with 2 entries at 811):**
1. gematria=811 → 2 primary matches appear simultaneously ✓
2. gematria changes to 500 → 0 matches ✓
3. gematria=410 → word "שמע" appears with source context "שמע בני מוסר אביך" ✓
4. initialsGematria=343, full=999 → secondary only, 0 primary ✓
5. gematria=811 AND initialsGematria=343 → both sections simultaneously ✓

**Why:** Show-more counters (`showPrimaryCount`, `showSecondaryCount`) reset via watchers when the match arrays change, so switching between different gematria values always shows the first page of results.

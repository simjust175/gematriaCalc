---
name: Matching behavior
description: How live gematria matching works and what was verified
---

Matching is entirely server-side. The client sends only normalized Hebrew text to `GET /api/matches` after a 350ms debounce. The server derives the current full gematria itself and returns `{ matches, isAlreadySaved }`.

Each saved entry appears at most once. Its `matchTypes` can contain `full_gematria`, `initials_text`, `initials_gematria`, `saved_word`, and `milui_gematria`; matching words are attached to that same entry as `matched_words`.

**Numeric rules:** The server-derived current ordinary full gematria is compared independently with saved `full_gematria`, saved `initials_gematria`, saved-word gematria, and persisted full מילוי values. מילוי matching is the lowest-priority reason and never depends on the calculator's selected מילוי form.

**Editable מילוי mappings:** Ordinary saves contribute only their primary value through the versioned derived index. “Save all forms” also writes one additive form-index row per named form, including duplicate totals under distinct form IDs. Matching groups those rows by saved entry while retaining every causing form in metadata. A pending mapping builds while the previous version stays active, then catches up and switches atomically. Canonical saved entries and words are never rewritten.

**Failure rule:** A canonical save stays committed if optional מילוי indexing fails. Missing active rows self-heal; incomplete coverage produces an explicit unavailable state rather than a valid empty match result.

**Text rule:** Canonical current text and its generated initials are compared with each saved `initials` value. Punctuation, גרש/גרשיים, ניקוד, and whitespace are normalized before comparison.

**Why:** Explicit Hebrew badges explain every reason without duplicate cards or misleading a ראשי תיבות value as a full-gematria value. Versioning prevents editable mappings from exposing mixed or stale derived values. A request ID plus abort handling prevents stale A→B→A responses from restoring old reasons.

**How to apply:** Preserve the unified response shape and derive numeric criteria server-side from input text. Read primary מילוי values from the active derived index and all-form values from the additive form index; consolidate cards by saved-entry ID after collecting variant metadata. Keep mapping changes on the staged version/catch-up/cutover path, and apply production schema changes only through Replit Publish's reviewed development-to-production diff. Do not add row limits before entry-level grouping; pagination belongs after deduplication.

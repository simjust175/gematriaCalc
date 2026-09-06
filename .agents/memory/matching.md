---
name: Matching behavior
description: How live gematria matching works and what was verified
---

Matching is entirely server-side. The client sends only normalized Hebrew text to `GET /api/matches` after a 350ms debounce. The server derives the current full gematria itself and returns `{ matches, isAlreadySaved }`.

Each saved entry appears at most once. Its reasons include full, ראשי תיבות text/numeric, סופי תיבות text/numeric, saved-word, and מילוי matches; matching words attach to that same entry.

**Numeric rules:** The server-derived current ordinary full gematria is compared independently with saved full, ראשי תיבות, סופי תיבות, saved-word, and persisted full מילוי values. מילוי stays lowest priority and does not depend on the selected form.

**Editable מילוי mappings:** Ordinary saves contribute only their primary value through the versioned derived index. “Save all forms” also writes one additive form-index row per named form, including duplicate totals under distinct form IDs. Matching groups those rows by saved entry while retaining every causing form in metadata. A pending mapping builds while the previous version stays active, then catches up and switches atomically. Canonical saved entries and words are never rewritten.

**Failure rule:** A canonical save stays committed if optional מילוי indexing fails. Missing active rows self-heal; incomplete coverage produces an explicit unavailable state rather than a valid empty match result.

**Text rule:** Canonical current text plus generated first and final letters are compared with the corresponding saved derived values. Punctuation, גרש/גרשיים, ניקוד, and whitespace normalize before comparison.

**Why:** Explicit Hebrew badges explain every reason without duplicate cards or misleading derived values as full gematria. Versioning prevents mixed מילוי data. Request IDs and abort handling prevent stale A→B→A responses.

**How to apply:** Derive all criteria server-side, map highlighted first/final graphemes back to original text, and fail closed if mapping cannot be verified. Consolidate by saved-entry ID. Apply production schema changes only through Publish.

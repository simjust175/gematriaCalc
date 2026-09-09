---
name: Matching behavior
description: How live gematria matching works and what was verified
---

Matching is entirely server-side. The client sends only normalized Hebrew text to `GET /api/matches` after a 350ms debounce. The server derives the current full gematria itself and returns `{ matches, isAlreadySaved }`.

Each saved entry appears at most once. Its reasons include full, ראשי תיבות text/numeric, סופי תיבות text/numeric, saved-word, and מילוי matches; matching words attach to that same entry.

**Numeric rules:** The server-derived current ordinary full gematria is compared independently with saved full, ראשי תיבות, סופי תיבות, saved-word, and persisted full מילוי values. מילוי stays lowest priority and does not depend on the selected form.

**Editable מילוי mappings:** Ordinary saves contribute only their primary value through the versioned derived index. “Save all forms” also writes one additive form-index row per named form, including duplicate totals under distinct form IDs. Matching groups those rows by saved entry while retaining every causing form in metadata. A pending mapping builds while the previous version stays active, then catches up and switches atomically. Canonical saved entries and words are never rewritten.

**Failure rule:** A canonical save stays committed if optional מילוי indexing fails. Missing active rows self-heal; incomplete coverage produces an explicit unavailable state rather than a valid empty match result.

**Text rule:** The complete normalized current target is compared with saved derived values as an exact letter multiset. Never shorten the target to its own generated first/final letters: שבת must remain three letters, not become ש or ת. Order is irrelevant, but length and every duplicate count must match. Punctuation, גרש/גרשיים, ניקוד, and whitespace normalize first; final-form equivalence applies only to סופי תיבות.

**Highlight rule:** Exact contributing graphemes keep the surrounding text’s navy color, weight, width, baseline, and line-height. Use only a pale gold background with zero padding/margin; never make letters gold or badge-like.

**Why:** Using a target phrase’s own derived edge letters creates subset false positives, such as a single saved initial ש matching the target שבת. Users expect reordered ראשי/סופי letters to match while preserving exact cardinality and the saved phrase’s actual derived order. Explicit Hebrew badges explain every reason without duplicate cards or misleading derived values as full gematria. Versioning prevents mixed מילוי data. Request IDs and abort handling prevent stale A→B→A responses.

**How to apply:** Derive all criteria server-side, use indexed gematria only to fetch permutation candidates, verify exact normalized letter counts before emitting a text reason, map highlights from stored derived values, and consolidate by saved-entry ID. Apply production schema changes only through Publish.

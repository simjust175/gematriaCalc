---
name: Tanach edge-letter discovery
description: Product rules for exact ראשי תיבות and סופי תיבות discovery in the Tanach corpus
---

Tanach ראשי תיבות and סופי תיבות discovery uses every normalized Hebrew letter entered in the calculator as one ordered word slot. A pattern of N letters scans exact N-word contiguous windows within one verse; one-letter patterns are valid. Logical word boundaries include whitespace, Hebrew maqaf U+05BE, ASCII hyphen U+002D, non-breaking hyphen U+2011, and en dash U+2013.

**Why:** The entered letters are the pattern—not initials/finals derived from the input words. Skipped, reordered, partial, cross-verse, or differently sized spans would change the requested match.

**How to apply:** Strip formatting and separators from calculator text to obtain the Hebrew-letter pattern, and derive the slot count from that pattern itself. Compare initials exactly; normalize ך/ם/ן/ף/ץ only for finals comparison. Use shared boundaries for cursor windows and classification. Preserve pointed display spelling, separators, and source indexes. Keep this method separate from numeric gematria matching.
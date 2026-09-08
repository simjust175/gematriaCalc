---
name: Tanach edge-letter discovery
description: Product rules for exact ראשי תיבות and סופי תיבות discovery in the Tanach corpus
---

Tanach ראשי תיבות and סופי תיבות discovery uses every normalized Hebrew letter entered in the calculator as one word slot. A pattern of N letters scans exact N-word contiguous windows within one verse; one-letter patterns are valid. Derived letters match as exact multisets: order is irrelevant, but length and every duplicate count must match. Logical word boundaries include whitespace, Hebrew maqaf U+05BE, ASCII hyphen U+002D, non-breaking hyphen U+2011, and en dash U+2013.

**Why:** The entered letters define required letters and quantities—not positional slots—so valid permutations must be discoverable. Skipped, partial, cross-verse, differently sized, or count-mismatched spans still change the requested match.

**How to apply:** Strip formatting and separators from calculator text to obtain the Hebrew-letter pattern, and derive the slot count from that pattern itself. Generate all fixed-size contiguous windows before counts and pagination, then compare exact letter-count profiles; normalize ך/ם/ן/ף/ץ only for finals comparison. Preserve pointed display spelling, phrase order, separators, source indexes, and contributing-edge highlights. Keep this method separate from numeric gematria matching.
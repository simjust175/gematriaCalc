---
name: Tanach edge-letter discovery
description: Product rules for exact ראשי תיבות and סופי תיבות discovery in the Tanach corpus
---

Tanach ראשי תיבות and סופי תיבות discovery must compare an exact ordered sequence over a fixed-size window of contiguous complete words within one verse. The candidate word count must equal the calculator input word count, with at least two words. Logical word boundaries include whitespace, Hebrew maqaf U+05BE, ASCII hyphen U+002D, non-breaking hyphen U+2011, and en dash U+2013.

**Why:** One letter represents one input word; skipped, reordered, partial, cross-verse, or differently sized spans would change the meaning of the match and produce misleading results.

**How to apply:** Use the shared boundary predicate for calculator derivation, source highlighting, Tanach cursor word indexes, edge-letter windows, and whole-word classification. Normalize ך/ם/ן/ף/ץ only while comparing edge-letter sequences. Preserve pointed display spelling, separators, and source letter indexes for display, reader navigation, and saving. Keep this method separate from numeric gematria matching.
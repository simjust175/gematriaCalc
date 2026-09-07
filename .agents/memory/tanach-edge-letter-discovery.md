---
name: Tanach edge-letter discovery
description: Product rules for exact ראשי תיבות and סופי תיבות discovery in the Tanach corpus
---

Tanach ראשי תיבות and סופי תיבות discovery must compare an exact ordered sequence over a fixed-size window of contiguous complete words within one verse. The candidate word count must equal the calculator input word count, with at least two words.

**Why:** One letter represents one input word; skipped, reordered, partial, cross-verse, or differently sized spans would change the meaning of the match and produce misleading results.

**How to apply:** Normalize ך/ם/ן/ף/ץ to their ordinary forms only while comparing edge-letter sequences. Preserve the canonical pointed Tanach spelling and source letter indexes for display, reader navigation, and saving. Keep this method separate from numeric gematria matching.
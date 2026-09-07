---
name: Tanach discovery all filter
description: The product meaning of the “הכול” classification in Tanach gematria discovery
---

The Tanach discovery “הכול” filter is the union of whole-word and contiguous whole-word-phrase matches. Partial, prefix, suffix, and internal-letter ranges may remain available to internal classification code but must not affect “הכול” results, totals, pagination, or `hasMore`.

**Why:** Users understand “הכול” as all legitimate complete-text matches, not every sliding-window range hidden by the removed partial-word UI filter.

**How to apply:** Exclude partial ranges before incrementing the “all” count and before pagination. Keep classification-specific counts and explicit internal partial queries independent when they are needed for representation tests.
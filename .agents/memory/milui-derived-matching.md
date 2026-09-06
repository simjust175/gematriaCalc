---
name: Derived מילוי matching
description: Product and safety rules for automatic saved-entry מילוי indexing and live matching.
---

Saved Hebrew text is the durable object. General מילוי is derived from that text using the current ready mapping; users never save a separate מילוי record or calculation.

**Why:** Requiring a second save creates user confusion, while comparing current input against stale or filling-only derived values produces mathematically misleading matches.

**How to apply:** Ordinary שמור must remain independent and automatically eligible for derived indexing. Compare current full מילוי only with saved full מילוי under the same ready active mapping version. Keep מילוי בלבד display-only unless a separately specified matching mode is introduced. During rebuild or failure, retain the previous ready index or suppress only מילוי matching; never hide ordinary matches or alter saved text.
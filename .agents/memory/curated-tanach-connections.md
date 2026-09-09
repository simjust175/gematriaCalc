---
name: Curated Tanach connections
description: Ownership, identity, and release rules for user-curated Tanach matches attached to saved calculations.
---

Curated Tanach matches are child connections owned by a saved manual calculation, not standalone library entries. Their identity is the parent plus the canonical book, chapter, verse, and inclusive Hebrew-letter range. Re-saving that identity must merge structured reason codes rather than create another child.

**Why:** A Tanach source can explain the same calculation in several ways, and the same source can belong to different calculations. Canonical source coordinates keep those connections stable while preserving every valid reason.

**How to apply:** Auto-save a missing parent and its requested connections in one transaction; re-derive source text and labels from the local corpus; key UI saved state by parent, source, and exact reason, then hydrate it from persisted parent connections after reload; remove children without deleting their parent. Keep schema changes additive, apply them to development after merges, and let Publish own the production schema diff rather than production startup.
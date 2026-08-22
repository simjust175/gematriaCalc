---
name: Tanach parashah citations
description: Conventions for validating Torah portion references against the local UXLC corpus.
---

Validate Torah portion start and end references against the local UXLC corpus and retain the source table’s Hebrew Tanach numbering.

**Why:** English editions can number verses differently around chapter transitions. For example, UXLC’s Genesis chapter ל״א ends at נ״ד, so browser expectations copied from an English 55-verse division are incorrect even though the canonical portion range is valid.

**How to apply:** Treat a published Hebrew-reading table as the citation source, but make database/API endpoint validation against the imported corpus the final authority before persisting or testing a boundary.
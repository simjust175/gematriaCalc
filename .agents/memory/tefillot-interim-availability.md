---
name: Interim Tefillot availability
description: Release rule for keeping preserved Tefillot functionality unavailable until its separate database is provisioned
---

Keep Tefillot visible as “coming soon,” but do not let the client call Tefillot endpoints until the separate multi-user database is provisioned and approved for activation. Combined discovery should continue showing Tanach results with a brief Tefillot-coming-soon note.

**Why:** The interim production release must not expose technical availability errors, and the legacy database must remain isolated from Tefillot and multi-user data.

**How to apply:** Preserve the Tefillot backend and database routing. When activating later, remove only the frontend availability gate after verifying the separate database, combined results, failure behavior, and publish schema diff.
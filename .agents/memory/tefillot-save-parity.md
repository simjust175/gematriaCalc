---
name: Tefillot save parity
description: User-requested shared meaning of Tanach and Tefillot save actions and schema review boundaries.
---

Tefillot must use the same save UX and meanings as Tanach, not an independent
save system: range saves are library entries, while match saves belong to the
current calculation and can be removed without deleting their parent.

**Why:** The user explicitly requested “the same save logic as the Tanach.”
Same prayer text in different occasions or services is not necessarily the
same cited occurrence; source context must survive saving and reopening.

**How to apply:** Preserve the existing RTL card styling, source metadata,
duplicate handling, library workflow, and private password/session auth.
When save support needs schema changes, prepare them for review rather than
automatically applying them at startup or post-merge. Preserve Tanach/manual
behavior on an unmigrated database. Test migrations only in a disposable
schema until separately authorized to apply them to an app database.

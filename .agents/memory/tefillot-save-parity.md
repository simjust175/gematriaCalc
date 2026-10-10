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

Number-only calculator inputs may own Tefillot match links, but ordinary numeric
phrase saves and numeric-parent Tanach saves retain their previous restrictions.

**Why:** The calculator offers prayer matches for numeric searches; rejecting
their parent makes the visible save action fail. Numeric parents have no Hebrew
letters, so counting them as missing מילוי expansions would disable otherwise
healthy Hebrew matching.

**How to apply:** Keep the numeric-parent exception prayer-only. Match saved
parents using calculator normalization, and measure Hebrew-derived index
coverage only over eligible Hebrew entries. Keep temporary bulk selection
distinct from a pending single save and from confirmed persisted state.

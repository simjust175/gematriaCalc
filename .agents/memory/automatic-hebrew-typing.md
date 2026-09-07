---
name: Automatic Hebrew typing
description: Semantic scope and consistency rules for the app-wide automatic Hebrew keyboard preference
---

Automatic Hebrew typing is one application-wide preference. Every field intended for Hebrew content—including search and modal configuration fields—must use the canonical shared behavior; authentication, numeric, URL, identifier, and other technical fields must remain native.

**Why:** Users expect the single calculator toggle to apply everywhere Hebrew is entered, while a blanket listener would corrupt passwords and technical values.

**How to apply:** New Hebrew-semantic inputs should opt into the shared keyboard composable. Never copy the SI-1452 map or create a screen-specific preference. Keep paste, composition, modifier shortcuts, navigation, caret insertion, selection replacement, and native RTL behavior intact.
---
name: Private Tefillot rollout
description: Boundary between the legacy-only release and the additive private Tefillot feature branch
---

Keep the legacy-only release’s Tefillot experience visibly “coming soon.” On the separate private Tefillot feature branch, the user explicitly approved additive Tefillot schema in the original private project, without account or owner routing. Development can enable Tefillot after the licensed corpus is imported; production remains disabled until the separate schema/data/verification/enablement rollout is approved.

**Why:** The earlier separate multi-user-database plan does not govern this user-requested private feature branch. Mixing the interim legacy release rule with the new private rollout would either block the authorized work or expose missing-data errors.

**How to apply:** Preserve APP_PASSWORD session auth and the production-off gate. Do not add multi-user/account ownership to the private release. Apply and import only with explicit one-time development commands; stage production schema through a reviewed Publish, import and verify production content separately, then enable in a final Publish.
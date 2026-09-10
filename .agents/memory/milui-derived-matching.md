---
name: Derived מילוי matching
description: Product and safety rules for automatic מילוי and deliberate occurrence-level variants.
---

General מילוי remains derived from normally saved Hebrew text using the current ready mapping. A separate explicit interpretation may be saved when the user deliberately composes accepted variants per letter occurrence. The primary UI may additionally persist one or two selected named common forms in the entry-linked form index; the legacy save-all flow remains backward-compatible.

**Why:** Most calculations should stay automatic and simple, but deliberate variant choices must remain reproducible without altering the phrase, base-word collection, or automatic index. Limiting the primary common-form picker to two keeps the interface focused while preserving the advanced per-occurrence composer. Repeated letters may require different choices.

**How to apply:** Ordinary שמור remains independent and automatically indexes only its primary form under one ready version. Selected common-form saves must contain one or two non-primary form IDs, preserve prior selected IDs, and transactionally ensure the primary entry plus explicit snapshots and linked form-index rows. Save-all still writes every named form for backward compatibility. Live matching compares the current ordinary full gematria with persisted values. Deliberate custom variants still use additive standalone snapshots with ordered occurrence choices, mapping context, and duplicate protection. Keep מילוי בלבד display-only. Never hide ordinary matches or alter saved data when derived matching fails.
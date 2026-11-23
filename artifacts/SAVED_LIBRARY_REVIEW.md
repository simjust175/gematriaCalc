# Saved Library review

This is the original implementation report. The [follow-up acceptance report](SAVED_LIBRARY_ACCEPTANCE.md) supersedes its interface screenshots and validation limitations.

The redesign applies only to the password-protected single-client application on `codex/private-saved-library`, based on `277d2eca2c257f454cee85978c8af25cff7f4c61`. The pull request targets `feature/weekly-parsha-base-words`.

## Behavior

- **התאמות שמורות** lists persisted relationships directly, including children of older saved calculations. Each row contains the original expression, an arrow, a verified common value when available, the canonical matching text, and one actions menu.
- **ערכים שמורים** retains existing saved expressions and calculations. Sorting, grouping, grid/list preference, copying, source metadata, and word/letter calculations remain available through secondary controls. Existing data does not record whether a parent was first created automatically or independently, so this tab preserves all saved entries.
- Search and source/reason filters apply before pagination across all saved relationships. Hebrew search ignores niqqud through the existing normalization engine; numeric search covers the parent and matching calculations.
- **שמור התאמה** creates or reuses the original calculation and its canonical child connection. **ההתאמה נשמרה → הצג בשמורים** opens and focuses the exact relationship. Independently saving the matching text is a secondary menu action.
- Menus support arrow keys, Home/End, Escape, outside dismissal and viewport positioning. Word details use a temporary modal; removal uses one confirmation and leaves a relationship's parent and siblings intact.

## Data safety

No schema migration is required. Numeric Tanach searches use the existing numeric-parent representation already supported for Tefillot, with an explicit integer-range error when the existing database column cannot represent the target. Ordinary independent numeric saves retain their existing restrictions.

Canonical source verification, structured reason codes and occurrence-based deduplication remain server-side. The middle value is omitted when existing reason data cannot establish an accurate common calculation, including a historical milui reason without its original mapping. Word details still use the established calculation engine.

No application database, production corpus, authentication model, deployment configuration, or multi-user branch was changed. Tests used a new PostgreSQL cluster on loopback and disposable schemas with local sequences and constraints.

## Visual evidence

The screenshots come from the real implementation with persisted canonical passages and engine-verified values. The Hebrew examples include אהבה ↔ אחד (13), חיים ↔ חכם (68), and מלך ↔ מים (90). The full-pasuk example uses its actual calculated numeric target.

- [Desktop](saved-library-desktop-chromium.png)
- [Desktop menu](saved-library-menu-desktop-chromium.png)
- [Phone](saved-library-mobile-chromium.png)
- [Phone menu](saved-library-menu-mobile-chromium.png)

The existing global navigation is preserved; the reference image's sidebar was not introduced.

## Validation environment and results

The test database was created from scratch at `127.0.0.1:55432`, outside every application database. Browser tests use ports 4173/4174 and a disposable schema, not the live development server. No credentials or application saved data were copied.

- `npm run build`: passed.
- `TZ=UTC npm test`: 232 passed. UTC makes the existing weekly-Parsha date fixture deterministic; its unchanged baseline assertion fails under this Windows host's default timezone.
- `npm run test:api`: 57 passed, 1 failed. The failure is the existing assertion for UXLC **2.5 / 27.6**: the publicly served upstream archive is now **2.6 / 27.7**. The isolated test corpus accurately identifies that version. The production importer still pins and rejects an unexpected checksum; it was not changed. All relationship persistence, numeric-parent, deduplication, deletion, authentication and calculation cases passed.
- Opt-in persisted Tefillot API suite: 2 passed, including mixed Tanach/Tefillot numeric relationships.
- Combined desktop/phone regression suite: 39 passed, 3 existing project-specific skips, 0 failures. This covers the library, save journey, late-save race conditions, calculator keyboard, Tanach reader and weekly-Parsha workflows.

Test reference corpora were imported only into the disposable local cluster. Upstream transport adaptations were confined to ignored test-bootstrap files; no production importer, corpus pin, fixture assertion or deployment configuration was relaxed.

The required standalone browser commands were also rerun successfully after final formatting:

- `npm run test:browser`: 13 passed, 3 existing project-specific skips.
- `node scripts/run-e2e.js tests/saved-library.spec.js`: 10 passed, covering desktop and phone.

Additional preservation checks passed: enabled Tefillot reader/save flows (15 passed, 1 project-specific skip), the repaired lower-result source menu and keyboard dismissal (3 passed, 1 project-specific skip), and the final desktop/phone/tablet visual capture checks (2 passed). [Tablet screenshot](saved-library-tablet.png).

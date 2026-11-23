# Three-control relocation acceptance

Private repository `simjust175/gematriaCalc`, existing branch `codex/private-saved-library`, PR #2 targeting `feature/weekly-parsha-base-words`.

## Starting state and scope

Verified the repository, branch and clean working tree at `6c6afde`, fetched origin, then fast-forwarded to the user's release-note commit `6bb08c7ce68f5ff0783f1ffbd41562affffd8bea` before editing. No new branch, PR merge or deployment.

Only the marked secondary calculator toolbar was removed. Its Parsha disclosure, bulk-selection button and discovery PDF button are gone, together with their toolbar spacing. Bulk-selection state, toggles, selected-card styles and bulk commit/cancel UI were retired. Individual match saving still posts one verified source relationship and retains its existing pending, success, failure, duplicate and exact-library-focus behavior.

An independent source comparison verified that the calculator header and original filter markup before the removed toolbar, and the match-card content/layout markup, are byte-identical to the starting version. Calculation logic, the matching engine, Hebrew-calendar implementation, authentication, source reader, saved-data schema, migrations, deployment configuration and release configuration were not edited.

[Source-scope verification](toolbar-scope-verification.json) records both unchanged-region hashes against the starting commit.

## Saved Matches tools

The compact toolbar contains **פרשת השבוע | לפי פרשה | הורד PDF**, only in the Matches tab.

- Weekly selection uses the existing server-side Hebrew-calendar helper and configured `TANACH_PARASHAH_SCHEDULE`, including combined readings and Israel/Diaspora differences. A holiday with no ordinary weekly portion returns an empty collection, without falling back to unrelated matches.
- Parsha browsing opens and focuses the existing Parsha select in the Saved Library filter menu. There is no second selector. The canonical all-Torah mode groups saved occurrences by Chumash/Parsha and sorts chapter, verse and actual start/end offsets before pagination. Selecting a portion uses the same `parsha_id` filter as the menu.
- Source, reason and normalized/numeric search filters are shared with PDF export. Global tab counts remain global; filtered results and pagination use the selected collection. Selecting prayers clears the Torah/weekly restriction. Empty portions show a clear empty state.
- The PDF action calls `POST /api/entries/curated-matches/export.pdf`. It reads saved relationships using the same filtering/order helper as the screen, ignores UI pagination/focus, and never calls discovery to populate the report. Unfiltered saved prayers and Nevi'im remain exportable; Torah/weekly browsing includes only genuine saved Torah coordinates.
- Each PDF occurrence includes its persisted original expression, pointed match, reference, reason and genuine value. Prayer source attribution is preserved. Existing RTL Chromium/font/page-break infrastructure is reused; no dependencies were added.

## Evidence

- [Calculator desktop](toolbar-calculator-desktop-chromium.png)
- [Calculator phone](toolbar-calculator-mobile-chromium.png)
- [Saved Matches desktop](toolbar-saved-library-desktop-chromium.png)
- [Saved Matches phone](toolbar-saved-library-mobile-chromium.png)
- [Weekly saved matches desktop](toolbar-weekly-desktop-chromium.png)
- [Weekly saved matches phone](toolbar-weekly-mobile-chromium.png)
- [Actual browser PDF](toolbar-saved-library-browser.pdf), [first-page preview](toolbar-saved-pdf-first-page.png)
- [Actual API PDF](toolbar-saved-collection.pdf)

The browser PDF contains **55 saved occurrences on 10 pages**, exported while only **40 rows** were loaded. Independent PDF text extraction verified exactly rows **1–55**, once each and sequentially. The API report independently contains **56 saved occurrences on 10 pages**, including an additional saved current-week occurrence; rows **1–56** were verified in order. These are deliberately saved test fixtures, not unsaved calculator discoveries.

The real browser journeys cover original calculator book/Parsha and weekly filtering, individual saving and exact Saved Library focus, all 54 filter options, canonical append order, filtered PDF downloads, weekly empty states, refresh, and no unrelated fallback. API tests snapshot persisted entries, words and both source relationship tables before/after reads and exports, then confirm cleanup restores the initial state. Existing recorded legacy-schema compatibility tests remain covered.

## Validation

- Unit suite: **255 passed**, zero failures/skips (`TZ=UTC`).
- Full serial API suite: **68 passed**, zero failures/skips.
- Relocation browser journeys: **6 passed**, zero failures/skips, actual desktop and mobile Chromium with prayers enabled.
- Production build: passed. Generated `dist` files are excluded from the commit.
- Original calculator/individual-save/Saved Library browser matrix: **59 passed, 17 existing project/feature skips**, combining the 58-pass run with a fresh passing run of the updated individual-save test. The latter had been collected before its obsolete bulk-button interaction was removed; its current version passed. No unresolved case remains in this matrix.
- Prayer-enabled individual-save and saved-journey suite: **30 passed**, zero failures/skips, including failure/retry, duplicate protection, exact source reopening and refresh on both desktop and mobile. Browser groups overlap and must not be added as a unique-test count.

The local browser harness initially needed normal process permissions on this Windows host. An exploratory mixed browser run also included legacy tests that explicitly expect prayers disabled; those tests are run separately with their intended configuration. Neither required an application workaround.

All database work used the existing dedicated loopback test cluster and disposable schemas, with schema-local sequences and foreign keys. No application or production database was reset, migrated, imported or rewritten.

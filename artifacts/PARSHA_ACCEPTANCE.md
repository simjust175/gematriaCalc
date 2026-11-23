# Parsha discovery, saved filtering and Hebrew PDF acceptance

Verified on 22 November 2026 on `codex/private-saved-library`, continuing PR #2 against `feature/weekly-parsha-base-words`.

## Starting state and scope

- Independently verified repository `simjust175/gematriaCalc`, existing branch, clean working tree, and starting commit `f485bef0588bbd2cd93253b0be18c3ed74c1d8b2`.
- Fetched `origin` before implementation; local and remote branch were identical. No branch was created or switched.
- Changes affect the private application. No deployment, production database migration, reset, import, or saved-record rewrite was performed.
- Tests use a separate loopback PostgreSQL cluster and disposable schemas with their own sequences and foreign keys. The existing exact legacy Saved Library schema compatibility checks remain green.

## Observed behavior

- Search **502**, standard Gematria, complete matches, all Torah portions: **316 genuine matching ranges**. Counts come from the engine's entire result set, not displayed cards.
- The single distribution response contains all **54 portions**, grouped under five Chumashim, including zero counts. Chumash totals: Genesis **101**, Exodus **49**, Leviticus **81**, Numbers **42**, Deuteronomy **43**.
- Actual examples: Bereshit **5**, Noach **21**, Lech Lecha **9**, Vayera **9**. These are fixture results, not the illustrative numbers in the request. Corpus: UXLC 2.6 (27.7); other corpus revisions may legitimately produce different totals.
- One request activates Torah discovery. Selecting a portion retains the global distribution, filters actual canonical coordinates, and shows references such as `בראשית י״ב:ג׳`. Returning to all portions restores the Torah total.
- The selector is a compact disclosure on desktop and a bounded bottom sheet on phones, with internal scrolling, keyboard dismissal and a current-week marker.
- API acceptance loads all seven pages at limit 50 and compares every book/chapter/verse/start/end tuple with an independent traversal of the matching engine. All ranges remain in canonical order, without gaps or duplicates.
- Match methods, type filters, including-kollel target, weekly portion, existing book controls and explicit partial-word semantics are preserved. Nevi'im, Ketuvim and prayers are excluded from the portion distribution.
- Saved Library's `סינון → פרשה` derives each saved child's portion from its own source coordinates, even when its parent's stored portion differs. Search, global counters, pagination, exact saved-row focus, refresh, source navigation and sibling-preserving deletion are covered.

## Boundary verification

Every one of the fixture's **5,853 imported Torah verse records** belongs to exactly one standard portion. Both endpoints of all 54 portions exist and have unique membership.

This exposed a pre-existing Yitro endpoint error: the application's UXLC chapter numbering continues through Exodus 20:26. Yitro now includes 20:24–26 and Mishpatim starts at 21:1. The catalog overlays canonical metadata when reading older databases; it does not update stored rows. Saving still validates the original canonical text and letter offsets and retains existing database IDs/foreign keys.

Primary text reference: [UXLC Exodus XML](https://tanach.us/Books/Exodus.xml). Verse numbering must follow the imported corpus, not a differently numbered printed edition.

## PDF review

- [Complete 502 report](parsha-502.pdf): **316 results on 42 A4 pages**, exported while only two UI pages were loaded. Independently extracted all row ordinals from the real PDF: exactly **1–316**, sequentially, each once.
- [PDF validation record](parsha-pdf-validation.json) records the final report's SHA-256, page count and complete sequential row check.
- [Bereshit / whole-word report](parsha-502-bereshit.pdf) verifies a selected portion and match-type scope.
- Visually reviewed first, middle and final pages: correct Hebrew shaping, readable niqqud, punctuated references, value/method, restrained navy/gold headings, sensible page breaks, page numbering and source attribution.
- PDF screenshots: [first page](parsha-pdf-first-page.png), [middle page](parsha-pdf-middle-page.png), [last page](parsha-pdf-last-page.png).
- The server uses the same filtering and canonical ordering for display and export, then renders the complete set in Chromium. It returns a real `%PDF-` file, never an HTML/print-dialog substitute.
- The existing `playwright-core` version is now an explicit runtime dependency. Replit already declares Chromium in `.replit`; that configuration is unchanged. The licensed Hebrew font is bundled and embedded locally. Export needs no external font or rendering service.
- An unavailable renderer produces a clear retryable error. Oversized reports fail explicitly instead of silently truncating. On a host without Chromium on `PATH`, set `GEMATRIA_PDF_CHROMIUM_PATH` to its executable.

## Screenshots

- [Desktop viewport](parsha-502-desktop-chromium-viewport.png)
- [Mobile viewport](parsha-502-mobile-chromium-viewport.png)
- [Desktop portion overview](parsha-502-desktop-chromium-panel.png)
- [Desktop canonical results](parsha-502-desktop-chromium-results.png)
- [Mobile portion overview](parsha-502-mobile-chromium-panel.png)
- [Mobile canonical results](parsha-502-mobile-chromium-results.png)
- [Desktop Saved Library filter](parsha-saved-filter-desktop-chromium.png)
- [Mobile Saved Library filter](parsha-saved-filter-mobile-chromium.png)

## Validation

- Unit suite: **249 passed**, zero failures/skips (`TZ=UTC`).
- Full API suite: **66 passed**, zero failures/skips, including actual corpus boundaries, complete pagination, legacy Saved Library compatibility and real Chromium PDF exports.
- Default browser regression group: **78 passed, 18 project-specific skips** after the corrected interaction was rerun. All active calculator/keyboard, Tanach discovery, Parsha reader, sidebar, weekly scan and Saved Library/count/source tests passed. The skips are the existing desktop-only drag/layout/tablet cases and mobile-only overflow case running under the opposite project; no corpus/schema guard skipped coverage.
- Enabled Tefillot/Parsha/save-journey browser group: **37 passed, 1 project-specific skip**. All six new Parsha cases passed on actual desktop/mobile Chromium with prayer results enabled before entering Torah mode.
- Final browser group after the mobile bottom-sheet refinement: **8 passed**, zero skips/failures: six Parsha acceptance cases plus both projects of the corrected base-word interaction. This refreshed the committed screenshots and complete PDF.
- Initial targeted Parsha browser run: **6 passed**; focused rerun of the three initial broad-sweep failures: **3 passed**. Groups overlap; these numbers should not be added as a unique-test total.
- Production build passed. Generated `dist` output is intentionally excluded from the source commit.
- The broad sweep exposed stale browser-test assumptions: a hardcoded update version older than the bundled release, an obsolete keyboard-control selector, and a click beneath an open corpus-autocomplete menu. Tests now derive a newer release, use the accessible checkbox and dismiss suggestions with Escape before using the underlying control. Bounded cleanup preserves the original failure if teardown also fails. Application update, keyboard and base-word behavior was not changed.

## Fetching into the private Replit workspace

These commands update the private development checkout; they do not merge or publish anything. First use the Replit Shell to verify the repository, existing branch and clean working tree:

```sh
git remote get-url origin
git branch --show-current
git status --short
```

Expected repository: `simjust175/gematriaCalc`; expected branch: `codex/private-saved-library`; expected status: empty. If there are local changes, preserve them before pulling. Do not discard files or switch to main.

```sh
git fetch origin
git pull --ff-only origin codex/private-saved-library
npm ci
git log -1 --oneline
```

Stop and restart the **Start application** development workflow (which runs `npm run dev`), then refresh the private preview. Existing Replit secrets and database stay unchanged. No database command or migration is needed. Confirm `command -v chromium` if PDF export reports that the renderer is unavailable; the existing Nix package supplies it. Do not use Publish/Deploy.

In the preview: search `502` → `לפי פרשה` → choose `בראשית`, then `נח`, then `כל הפרשיות` → save a match → `הצג בשמורים` → `סינון → פרשה` → return to discovery and use `הורד PDF`.

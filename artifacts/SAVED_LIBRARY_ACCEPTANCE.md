# Saved Library follow-up acceptance

This change continues the private single-user application on `codex/private-saved-library` from `824df94b352b31b766b0fa8488bd225ccbbf3d1a`, updating PR #2 against `feature/weekly-parsha-base-words`. It prepares release 1.0.3. No deployment, production write or migration is part of this change.

## Observed fault and evidence

Read-only HTTP inspection of the Replit development preview supplied for this task established:

| Request                        | Observed response                                   |
| ------------------------------ | --------------------------------------------------- |
| `/api/auth/check`              | 200, `authenticated: false`                         |
| `/api/entries?limit=1`         | 401, `not_authenticated`                            |
| `/api/entries/curated-matches` | 404, HTML `Cannot GET /api/entries/curated-matches` |
| `/app-release.json`            | 200, release 1.0.2                                  |

The same preview served `server/savedLibrary.js` containing the GET registration and `server/app.js` containing `registerSavedLibraryRoutes(app, ...)`. Its development command ran Vite with a plain, long-running `node server/index.js`. Thus the served frontend/source and running API were out of step: the missing route never reached a database query. This is a runtime route-availability defect, not evidence of a production SQL error.

A separate unauthenticated read of the production host returned 401 for the match endpoint, proving its route is registered there. Authenticated production responses and Replit server logs were unavailable through the connected account. No authenticated production records or credentials were accessed. The compatibility claim below applies to the exact recorded production schema, rather than an unobserved live SQL failure.

Development now runs Node watch mode for the API as well as Vite for the frontend. An initial workflow restart is still necessary after pulling the change; an already-running old process cannot activate its own new startup command. Production startup is unchanged.

## Compatibility and counters

The database acceptance fixture reconstructs the columns, sequences, defaults, constraints and indexes recorded in `docs/production-schema-review.csv`, inside a disposable local schema. It has the legacy private Tanach tables and no optional Tefillot tables or entry columns. Existing seeded entries and parent-owned matches load through both APIs, search and exact focus remain available, and complete saved-row snapshots remain byte-for-byte unchanged.

A second fixture enables Tefillot while omitting optional display metadata. It reproduced `column u.subsection does not exist` locally. Optional metadata is now read without requiring those columns; required identities and source coordinates remain strict. This separately proven compatibility case is not presented as the live preview's 404 cause.

Counts have their own authenticated endpoint. Entries and matches are counted independently, so a failed match-row query cannot force a valid entries count to zero. Unknown counts render as unknown, with separate loading/error state. Loading, empty results, authentication expiry, a missing API version, and database/server failure remain distinct. Errors never masquerade as empty results.

## Interface and screenshots

The library uses a shared compact segmented control, a single joined search/filter composition, and a library-only fluid container with about 1,528px of usable content on large screens. Global navigation is preserved. Normal relationship rows retain only the original expression, arrow, verified common value where applicable, matching text and actions menu.

Real persisted canonical passages are captured at [390px](saved-library-mobile-chromium.png), [768px](saved-library-768.png), [1440px](saved-library-1440.png), [1920px](saved-library-1920.png), and [2560px](saved-library-2560.png). Menu screenshots remain available for [desktop](saved-library-menu-desktop-chromium.png) and [phone](saved-library-menu-mobile-chromium.png).

## Deployment instructions — approval required

1. Review PR #2 and its validation results; merge only after approval into the private target branch.
2. In the private Replit development workspace, pull the approved branch and install its locked dependencies. Stop and start the existing **Start application** workflow once. This activates the newly registered API routes and development reload protection.
3. While signed in, verify `/api/entries`, `/api/entries/curated-matches` and `/api/entries/counts` return successful JSON, both tab counts match persisted records, and an existing saved relationship opens its exact source. There is no data repair or SQL migration to run.
4. Publish production only after separate approval using the existing Replit build/start configuration. Check release 1.0.3, both library tabs, counts, search and an existing saved match after publication. Do not run the development/test fixture importers against an application database.

## Automated acceptance

All writes used the loopback disposable PostgreSQL cluster and guarded disposable schemas. The build passed. The unit suite passed **234/234** with `TZ=UTC` (the existing weekly-date fixture assumes UTC), including an actual imported-route edit that changes a retained 404 into a registered response under the configured development watch command.

The full `npm run test:api` suite passed **60/60**, including both recorded-private-schema tests. Its corpus fixture was explicitly selected and checked against the reviewed UXLC 2.6 archive SHA-256; the production importer and default UXLC 2.5 expectation remain unchanged. [Fixture selection and provenance](../docs/tanach-source.md#disposable-test-corpus).

The combined Saved Library, counter/error-state, save journey, calculator keyboard, Tanach reader and weekly-Parsha browser suite passed **47 tests**, with **5 expected skips** (project-specific cases and Tefillot disabled for that run). This covers real persisted counts, an unavailable match listing with visible entries, unknown counts, authentication failure, the observed HTML 404, genuine empty state, search/filter reset, exact saved-match focus, refresh, duplicates, source opening, and removal without losing sibling matches.

Final screenshots and layout/menu checks passed at 390, 768, 1440, 1920 and 2560 pixels. The one focused correction pass constrained the segmented control, kept text lines readable, and made phone actions 44px touch targets. No further design cycle was performed.

The enabled Tefillot and complete save-journey browser run also passed **31 tests**, with **1 expected project-specific skip**. It verifies the complete prayer confirmation-to-focused-library journey on desktop and phone, reader selections, exact source reopening, duplicate state, sibling-preserving removal, numeric targets and delayed-response safety. The mixed-source Tefillot API suite passed **2/2**. No failures remain in the relevant local acceptance runs.

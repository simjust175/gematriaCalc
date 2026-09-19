# Production account migration review

Reviewed: 2026-09-16 (UTC). **Decision: HOLD — not approved for publishing.**

## Evidence and limits

Read-only queries against the production replica and development catalogs are
saved in `production-schema-review.csv` and `development-schema-review.csv`.
These are catalog comparisons, not the actual generated Publish SQL, which
has not been obtained or approved. No production writes or publish occurred.

`production-ownership-baseline.csv` records all 11 private tables in one SELECT
snapshot: 297 saved entries, 994 saved words, 170 base words, 7 curated matches,
15 explicit interpretations, 150 save modes, 16 form-index rows, 444 index rows,
1 preference, 2 mapping versions, and 1 index-state row.
Only counts and hashes were retrieved, not private text or session contents.

The fingerprint expression matches `server/accounts.js`: MD5 of ordered JSONB
rows excluding only `owner_id`, with the same per-table ordering and separator.
These are preliminary replica observations, not a locked pre-migration snapshot.
Refresh them inside the controlled migration transaction; writes since this
review and replica lag mean this file cannot prove later preservation by itself.
No after-backfill snapshot exists because the production backfill has not run.

## Release blockers

1. **The candidate schema is not additive only.** No existing table or column
   removals were found, but the catalog comparison removes two saved-entry unique
   indexes, the base-word global unique constraint/index, and the two global
   mapping-status unique indexes. It changes the index-state primary key from
   `(id)` to `(id, owner_id)`. These replacements are intentional multi-user
   semantics but require an explicitly approved non-additive phase.
2. **Schema synchronization cannot replace the data migration.** Development adds
   `app_accounts`, `account_entitlements`, and eleven NOT NULL owner columns with
   no defaults. Production has none of them and already has populated tables.
   Adding NOT NULL columns directly cannot backfill those rows. Publishing the
   final development schema does not execute the legacy-account INSERTs or
   ownership UPDATEs in `ensureMultiUserFoundation`.
3. **Production startup does not perform that backfill.** `server/db.js` passes
   `allowSchemaChanges: false` in production. The read-only foundation path
   requires the legacy account to exist. Even empty newly created account tables
   are insufficient for the new application.
4. **One constraint removal targets the wrong name.** The observed production
   and development catalogs both retain
   `explicit_milui_interpretation_normalized_text_calculation_m_key`.
   The migration instead tries to drop
   `explicit_milui_interpretations_normalized_text_calculation__key`.
   Its `IF EXISTS` hides the mismatch. The surviving global uniqueness rule can
   reject identical explicit interpretations saved by different accounts.
5. **Migration reporting undercounts explicit interpretations.** Two successive
   assignment calls overwrite the same `backfilled` counter, rather than adding
   the linked and unlinked assignment counts. Fingerprint checks still cover the
   content, but this count must be corrected before relying on the report.

## Controlled release requirements

- Keep public signup disabled. Do not publish this candidate schema as-is.
- Obtain approval for a staged plan: additive account tables and nullable owner
  columns first; a separately authorized ownership transaction next; NOT NULL
  constraints and approved uniqueness replacements last.
- Confirm current recovery readiness immediately before production work.
- Use an authorized production operator path. The Agent database interface is
  read-only for production; do not substitute development credentials or attempt
  to bypass that boundary.
- Quiesce writers or lock all private tables during the ownership transaction.
  Create exactly one hidden legacy client with active `legacy_unlimited`,
  `is_unlimited=true`, and `billing_exempt=true`.
- Capture counts/fingerprints before and after assignment in that transaction.
  Require identical private content and counts, zero null owners, correct
  parent-child ownership, and all preexisting rows assigned to that legacy client.
  Roll back on any mismatch. Preserve the report before approving publication.
- Inspect the actual generated Publish SQL, including constraint names and
  ordering. Do not select data overwrite.
- After the authorized release, verify the existing password login resolves to
  the hidden legacy account and returns its saved data; verify signup remains
  disabled. Never include passwords, cookies, or session contents in evidence.

## Acceptance status

| Requirement | Result |
| --- | --- |
| Production diff reviewed and additive only | Catalog diff reviewed; additive-only requirement FAILS |
| Production before/after fingerprint verification | Preliminary before snapshot recorded; controlled backfill and after snapshot BLOCKED |
| Existing password login against hidden legacy account | Production verification BLOCKED: account schema is absent |
| No publish until migration report approved | Preserved; no publish performed |

`tests/multi-user.test.js` contains development legacy-login and isolation checks,
but these are not evidence of production login or a production migration.
No application code was changed and no tests were run for this read-only review.
The production release remains incomplete until the blockers and production
checks are resolved.
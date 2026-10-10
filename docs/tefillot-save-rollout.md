# Private Tefillot save rollout

The implementation shares the existing save UX and APIs. It does not change
password/session authentication, run schema migrations at startup/post-merge,
or publish the application.

## Prepared migration (not applied to development or production)

`server/migrations/20261010_add_tefillot_saves.sql` adds:

- A canonical prayer unit and inclusive Hebrew-letter range on saved entries.
- A unique prayer-occurrence index; the existing manual-text index now excludes
  cited prayer entries so identical manual/prayer text remains distinct.
- Parent-owned curated prayer matches, with unique occurrence identity and
  merged reason codes. Deleting a link leaves its parent and standalone range
  intact; deleting a parent cascades its links.

Tanach coordinate fields, indexes, and child table remain unchanged. Prayer
metadata is read from the canonical referenced corpus, not trusted from browser
labels. Corpus units referenced by saved items cannot be deleted accidentally.

Apply the migration only after separate explicit database approval. It is not
listed in `scripts/post-merge.sh`. Until provisioned, Tanach/manual library
behavior remains available and prayer saves return
`503 tefillot_save_schema_required` with a clear UI message, never a fake success.
No production database connection or schema mutation is part of this work.

## Save semantics

- “שמור טווח”: saves the exact cited result or within-unit reader selection as
  a normal library entry. Repeated occurrence saves return 409 with its entry ID.
- “שמור התאמה”: attaches the exact cited result to the calculator's saved manual
  parent, creating that parent if needed. Mixed Tanach/prayer bulk saves are atomic.
- The library returns one unified curated list with source-qualified child
  identities. Prayer links are removed through the existing child DELETE path
  with `?source=tefillot`; Tanach DELETE requests are unchanged.
- Source metadata includes תפילות, occasion, service, section, source reference,
  work/version, and license. Both standalone prayer ranges and linked matches
  reopen their exact highlight in the existing reader.
- Cross-unit native selections retain the previous plain-text calculation save;
  they do not claim a single-unit citation. Exact discovery matches and
  within-unit native selections retain canonical occurrence coordinates.

## Isolated verification

- `npm test`
- `npm run test:api` (unchanged schema / existing Tanach regression suite)
- `node scripts/run-e2e.js --api tests/tefillot-saves-legacy-api.test.js`
- `npm run test:tefillot:saves:api`
- `npm run test:tefillot:saves:browser`

The two save suites opt into `E2E_TEFILLOT_SAVES=true`. The existing harness
prepares a disposable schema, verifies its active schema, applies the prepared
migration there only, and removes that schema afterward. It never migrates
`public`, development app data, or production. An imported licensed corpus
must already be available to copy as reference data.

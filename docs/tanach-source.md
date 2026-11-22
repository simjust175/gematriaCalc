# Tanach source and attribution

The Tanach reader uses the **Unicode/XML Leningrad Codex (UXLC) 2.5 (27.6)**, published by Tanach.us Inc. in April 2026.

Source archive: <https://www.tanach.us/Books/Tanach.xml.zip>  
License statement: <https://tanach.us/License.html>

Tanach.us states that all biblical Hebrew text, in any format, may be viewed or copied without restriction. Attribution is retained in the local database and reader interface:

> Unicode/XML Leningrad Codex, UXLC 2.5 (27.6), Tanach.us Inc., April 2026.

Run `npm run import:tanach` once for a new database or again to repeat the idempotent import. Normal reader requests use only the locally imported PostgreSQL corpus.

The importer pins the April 2026 archive by SHA-256 and refuses to import changed bytes under the same source URL.

## Disposable test corpus

API tests keep the same UXLC 2.5 / build 27.6 expectation by default. When the
original archive is unavailable, an explicitly prepared disposable database may
use the reviewed upstream UXLC 2.6 / build 27.7 fixture. Its archive SHA-256 is
`423469bdcc4bfe36d7666f8e76fbd02c1674d77469093c06cee9779c0fba83e3`, as published
on the source's [technical page](https://www.tanach.us/Pages/Technical.html).

For that fixture only, set `E2E_TANACH_FIXTURE=uxlc-2.6-27.7` and
`E2E_TANACH_ARCHIVE_PATH` to the downloaded archive before running
`npm run test:api`. The test requires the harness's disposable `E2E_SCHEMA`,
verifies the archive hash, and then checks the API's reported version, build,
23,213-verse count, representation, and canonical text calculations. An unknown
fixture, missing archive, or different hash fails validation. Expectations are
never inferred from the database's reported metadata.

This test-only selection does not change the production importer, import a
corpus automatically, migrate a database, or authorize application database
changes. The fixture database must be independently prepared and disposable.

## Torah portion boundaries

The 54 individual annual-cycle **פרשיות התורה** are metadata only: their displayed text always comes from the local UXLC verse records above. Their inclusive start/end references are taken from Snunit’s **[סדר הקריאות בבתי הכנסת](https://kodesh.snunit.k12.il/i/tm/viewByParasha.html)** table, consulted on 2026-08-22.

The application stores the portions separately from their text, validates all 108 endpoints against the imported corpus before seeding, and retains the standard individual portions even when a calendar year reads two together. Hebrew display names use the canonical app spellings (for example, לך לך, שלח, קרח, חקת, and נצבים); punctuation differences in the source table do not change the cited ranges.

# Tanach source and attribution

The Tanach reader uses the **Unicode/XML Leningrad Codex (UXLC) 2.5 (27.6)**, published by Tanach.us Inc. in April 2026.

Source archive: <https://www.tanach.us/Books/Tanach.xml.zip>  
License statement: <https://tanach.us/License.html>

Tanach.us states that all biblical Hebrew text, in any format, may be viewed or copied without restriction. Attribution is retained in the local database and reader interface:

> Unicode/XML Leningrad Codex, UXLC 2.5 (27.6), Tanach.us Inc., April 2026.

Run `npm run import:tanach` once for a new database or again to repeat the idempotent import. Normal reader requests use only the locally imported PostgreSQL corpus.

The importer pins the April 2026 archive by SHA-256 and refuses to import changed bytes under the same source URL.
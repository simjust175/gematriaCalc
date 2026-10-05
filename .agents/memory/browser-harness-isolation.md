---
name: Browser harness isolation
description: Safety rules for keeping browser tests out of the live development app and database.
---

Browser tests must use Playwright's configured relative base URL and the dedicated E2E password. Their disposable schema must contain schema-local sequences; cloning defaults that point at public sequences still mutates the real database.

**Why:** A browser test once hardcoded the normal development port and workspace password, bypassing the isolated E2E server. Table clones can also retain public sequence defaults unless explicitly replaced.

**How to apply:** Keep browser navigation relative, derive permission origins from the current page URL, create schema-local sequences for cloned serial columns, and copy only immutable reference/configuration rows into the disposable schema.

Disposable schema copies also need schema-local foreign keys when testing cascades or reference integrity. PostgreSQL `LIKE INCLUDING ALL` does not copy foreign keys; their absence can make correct application behavior appear broken.

**Why:** A cascade API regression test failed only in the disposable copy because its foreign keys were missing, not because the application’s delete behavior was wrong.

**How to apply:** Recreate copied foreign-key constraints against copied tables only. Never retain references to public tables in test constraints. API regression suites should use the same disposable-schema isolation as browser tests.
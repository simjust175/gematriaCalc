---
name: Browser harness isolation
description: Safety rules for keeping browser tests out of the live development app and database.
---

Browser tests must use Playwright's configured relative base URL and the dedicated E2E password. Their disposable schema must contain schema-local sequences; cloning defaults that point at public sequences still mutates the real database.

**Why:** A browser test once hardcoded the normal development port and workspace password, bypassing the isolated E2E server. Table clones can also retain public sequence defaults unless explicitly replaced.

**How to apply:** Keep browser navigation relative, derive permission origins from the current page URL, create schema-local sequences for cloned serial columns, and copy only immutable reference/configuration rows into the disposable schema.
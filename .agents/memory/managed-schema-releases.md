---
name: Managed schema releases
description: How additive PostgreSQL schema changes move safely from development to production
---

Apply additive SQL migrations to the development database from Replit's post-merge setup. Let Replit Publish introspect development and production and apply the production schema diff. Never add schema mutation to application startup or deployment build commands.

**Why:** Replit provides exactly these development and production application points. Inventing a startup or deployment-time migration can mutate production repeatedly or before recovery and diff checks.

**How to apply:** Keep idempotent SQL in the repository, run it from the configured post-merge setup against its development `DATABASE_URL`, and test that same SQL against a clean isolated schema. Before publishing, recheck recovery readiness and review the Publish diff without selecting data overwrite.

Schema synchronization alone is not sufficient for migrations that need account
seed rows or ownership backfills. Stage nullable additions, controlled data
assignment, and constraint enforcement separately; do not classify replacements
of existing uniqueness rules or primary keys as additive-only.

**Why:** A development database can have populated NOT NULL ownership fields
while production has populated tables without ownership. A schema diff does not
carry over the seed INSERTs and backfill UPDATEs that made development valid.

**How to apply:** Gate publication on a reviewed data-migration report as well
as DDL review. Agent production queries are read-only; an authorized operator
must execute production writes, with transactional preservation checks.
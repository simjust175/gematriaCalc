---
name: Database test isolation
description: Why database-mutating Node test files must not execute concurrently.
---

Run test files that create and clean up development database records with Node test concurrency set to one.

**Why:** Separate files otherwise overlap temporary records. Tests that correctly assert global row counts can observe another file's in-flight rows and fail nondeterministically even though both clean up.

**How to apply:** Keep database integration suites serialized whenever they share the same database and include global integrity assertions.
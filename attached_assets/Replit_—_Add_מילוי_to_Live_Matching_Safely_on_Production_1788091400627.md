# ADD מילוי TO LIVE SAVED MATCHING — PRODUCTION-SAFE IMPLEMENTATION

The מילוי calculator now exists.

We want saved entries to participate in live matching through their **גימטריית המילוי המלא**.

## PRIMARY PRODUCT BEHAVIOR

When the user's CURRENT LIVE FULL GEMATRIA equals the **full מילוי gematria of a previously saved entry**, show that saved entry in the existing live-match panel.

Label the reason clearly:

**גימטריית מילוי**

Example conceptually:

Saved entry:

אברהם

Current configured מילוי of אברהם = X

Later the user types another phrase whose NORMAL full gematria becomes X.

The saved entry:

אברהם

should appear as a saved match with the badge:

**גימטריית מילוי**

---

# CRITICAL — THE CLIENT IS ACTIVELY USING THIS PRODUCTION SYSTEM

This application currently contains real client data and is actively being used.

DATA SAFETY IS THE HIGHEST PRIORITY.

The implementation must:

- not delete any existing saved entries
- not modify the original text of any saved entry
- not rewrite existing full gematria
- not rewrite ראשי תיבות
- not rewrite existing word records
- not reset the database
- not recreate production tables
- not reseed production data
- not interrupt the client's ability to calculate or save
- not leave the matching system in a mixed/inconsistent state during a מילוי configuration update

If there is any uncertainty about safe migration, STOP before applying a destructive operation and report it.

---

# 1. DO NOT STORE מילוי AS CANONICAL SAVED-ENTRY DATA

The original saved phrase remains the source of truth.

The existing SavedEntry / SavedWord records must remain untouched.

Do NOT add מילוי values directly into the existing saved-entry rows if that would require rewriting/backfilling those rows.

Instead, implement מילוי matching as a **derived/indexed layer**.

This matters because the מילוי mapping is editable.

Changing:

ו → ואו

to:

ו → ויו

changes the CURRENT interpretation of saved מילוי values.

Therefore an old מילוי number must not be treated as immutable historical data.

---

# 2. USE A SEPARATE DERIVED מילוי INDEX

Prefer a separate additive table conceptually similar to:

```text
saved_entry_milui_index

id
saved_entry_id
mapping_version
full_milui_gematria
created_at / updated_at
```

Use appropriate keys/indexes for the current database architecture.

The important properties are:

- references the existing saved entry
- stores only DERIVED מילוי matching data
- includes the מילוי mapping/configuration version used
- does not alter the existing saved-entry record

Use a foreign key policy that is safe for production.

Do NOT introduce an accidental `ON DELETE CASCADE` path that could wipe saved client data.

Prefer restrictive/safe deletion behavior unless the existing architecture has a carefully verified alternative.

---

# 3. VERSION THE מילוי CONFIGURATION

Because the client can edit the מילוי table, the matching index must know which mapping generated each value.

Introduce/reuse a clear mapping version.

Conceptually:

```text
milui_config_version = 1
```

When the mapping changes:

create a NEW version.

Do NOT silently overwrite the meaning of existing indexed numbers while they are being queried.

---

# 4. ZERO-DOWNTIME CONFIG CHANGE

When the client edits the מילוי mapping:

DO NOT immediately overwrite all currently active matching values in place.

Use a safe staged process.

Conceptually:

1. Current active mapping = version N.
2. Client saves a new מילוי configuration.
3. Persist it as version N+1.
4. Keep version N active for matching temporarily.
5. Build derived index rows for version N+1.
6. Verify the new index is complete.
7. Perform a final catch-up pass for entries created while the rebuild was running.
8. Verify again.
9. Atomically switch the active mapping/index from N to N+1.
10. Only then use N+1 for live matching.

This prevents the client from seeing a mixture where some saved entries use the old מילוי and others use the new one.

---

# 5. DO NOT DELETE THE OLD VERSION IMMEDIATELY

After successfully switching to the new mapping version:

keep the immediately previous derived index/version temporarily so rollback remains possible.

Do not delete old versions as part of the same transaction that activates the new one.

Cleanup can happen later through a separate safe maintenance task if required.

The dataset is small enough that safety is more important than aggressive cleanup.

---

# 6. HANDLE CONCURRENT SAVES DURING REINDEXING

The client may save a new gematria entry while a new מילוי configuration is being indexed.

The system must account for this.

Before switching the active mapping version:

run a catch-up query for saved entries that do not yet have an index row for the new mapping version.

Index them.

Then verify:

```text
number of saved entries eligible for מילוי
==
number of corresponding indexed entries for the new active version
```

Do not switch the active version until coverage is complete.

---

# 7. NEW SAVED ENTRIES

When the client presses the existing:

**שמור**

button:

continue saving the entry through the EXISTING proven save path.

Do NOT make saving dependent on a dangerous rewrite of the existing logic.

After/alongside the normal save, create the derived מילוי index value using the CURRENT active מילוי mapping.

If the derived-index write fails:

- do NOT delete or roll back an otherwise valid saved gematria entry solely because the optional מילוי index failed
- log/report the indexing problem
- allow a safe reindex/catch-up process to repair it

The client's saved phrase is more important than the derived matching cache.

---

# 8. SELF-HEALING / MISSING INDEX SAFETY

The system should be able to detect saved entries missing a מילוי index row for the active mapping version.

Provide a safe internal reindex mechanism.

Do not require deleting/recreating saved entries.

Where appropriate, the matching service may:

- repair missing derived rows
- or flag them for a safe reindex

Do not silently return incorrect matches.

---

# 9. LIVE MATCH RULE

For this phase, implement exactly ONE new מילוי match type:

CURRENT LIVE FULL GEMATRIA

→ compare against

SAVED ENTRY'S CURRENT `full_milui_gematria`

for the ACTIVE מילוי mapping version.

If equal:

return that saved entry with match type:

`milui_gematria`

UI label:

**גימטריית מילוי**

---

# 10. DO NOT ADD OTHER מילוי MATCH TYPES YET

Out of scope for this phase:

- מילוי בלבד matching
- word-level מילוי matching
- ראשי תיבות מילוי matching
- Tanach מילוי matching
- saving מילוי as an immutable historical snapshot

Start with one clear, valuable type:

**current normal gematria → saved full מילוי gematria**

---

# 11. MULTIPLE MATCH REASONS

A saved entry may match through:

- גימטריה מלאה
- התאמה בתיבה
- ראשי תיבות
- גימטריית ר״ת
- גימטריית מילוי

Do NOT render duplicate cards.

One saved entry should appear ONCE.

Attach all applicable match reasons.

Example:

```text
שמע ישראל

[ גימטריה מלאה ] [ גימטריית מילוי ]
```

or:

```text
[ התאמה בתיבה ] [ גימטריית מילוי ]
```

Preserve the existing deduplication behavior.

---

# 12. UI BADGE

Add a compact match badge:

**גימטריית מילוי**

Use the same badge system already used for other matching reasons.

It should be clear but not visually dominant.

Do not use color alone to communicate the match type.

---

# 13. PRIORITY

Maintain sensible priority:

1. גימטריה מלאה
2. התאמה בתיבה
3. ראשי תיבות / גימטריית ר״ת as currently designed
4. גימטריית מילוי

Do not let מילוי matching dominate the primary match experience.

If the existing match ordering has a better established hierarchy, integrate מילוי consistently without disrupting it.

---

# 14. מילוי SETTINGS CHANGE MUST UPDATE MATCHING

When the client changes his מילוי configuration:

the displayed/calculated מילוי of saved entries and the live מילוי matching behavior must eventually use the NEW ACTIVE configuration.

After the safe versioned rebuild and atomic activation:

all matching must use the new configuration.

Do NOT keep matching against stale מילוי values.

---

# 15. EXISTING STANDARD DATA MUST NOT CHANGE

Changing the מילוי table must NOT alter:

- original saved text
- normalized saved text
- standard full gematria
- ראשי תיבות
- גימטריית ראשי תיבות
- saved word gematria
- Tanach corpus
- Tanach matching

Only the DERIVED מילוי index changes.

---

# 16. MIGRATION SAFETY

Before making schema changes:

record counts for at least:

- saved entries
- saved words
- other existing client-owned saved-data tables affected by relationships

Then apply only additive schema changes.

After migration, verify the same counts.

Required:

```text
saved entries deleted = 0
saved words deleted = 0
existing saved entries modified = 0
existing saved words modified = 0
```

Do not use:

- DROP
- TRUNCATE
- reset
- destructive recreate
- seed replacement
- production test cleanup

---

# 17. BACKUP / RECOVERY

Before applying the production migration:

create or confirm a recoverable database backup/snapshot using the mechanisms available in the current environment.

Do not claim a backup exists unless it was actually created/verified.

If a recoverable backup cannot be confirmed, STOP and report before applying the production schema migration.

---

# 18. REHEARSE BEFORE PRODUCTION IF POSSIBLE

If the current environment supports a staging/copy database:

rehearse the additive migration and initial מילוי index build there first.

Verify:

- counts
- matching
- config-version switching
- no deleted records

Then apply the same verified migration to production.

Do not create risky production experiments if a safe rehearsal path is available.

---

# 19. INITIAL INDEX BUILD

For the existing client's saved library:

build the first מילוי derived index using the CURRENT persisted מילוי configuration.

This is a READ of existing saved text and a WRITE only to the NEW derived index.

Do NOT rewrite the existing saved records.

After build, report:

- current active מילוי mapping version
- number of saved entries
- number successfully indexed
- number missing
- number failed
- number of existing records modified: MUST BE 0
- number of existing records deleted: MUST BE 0

Do not activate the matching feature if indexing is incomplete without explaining the limitation.

---

# 20. DATABASE INDEXES / PERFORMANCE

Add an appropriate database index for fast lookup by:

- active mapping version
- full מילוי gematria

Conceptually:

```text
(mapping_version, full_milui_gematria)
```

Do not scan every saved phrase and recalculate מילוי on every keystroke.

The client is actively typing and matching must remain fast.

---

# 21. LIVE REQUEST BEHAVIOR

Integrate the new match type into the existing debounced saved-match request.

Do NOT create an entirely separate uncontrolled request stream on every keystroke.

Preserve:

- existing debounce
- stale-request protection
- cancellation/ignore of outdated responses

A response belonging to an older gematria value must never overwrite the latest live results.

---

# 22. FAILURE MODE

If the מילוי derived index/database lookup temporarily fails:

do not break the ordinary calculator.

Do not show:

"אין התאמות"

as if that were a valid result if the real problem is a database failure.

Preserve the existing connection/error handling.

Normal gematria calculations must continue working locally.

---

# 23. TESTS — MATCHING

Add tests for:

1. saved full מילוי gematria matches current normal gematria
2. nonmatching מילוי entry does not appear
3. multiple saved entries with same מילוי value all appear
4. saved entry matching full gematria + מילוי renders once with two match types
5. saved entry matching word + מילוי renders once
6. badge says גימטריית מילוי
7. changing live value removes stale מילוי match
8. existing match types still work

---

# 24. TESTS — CONFIG VERSION CHANGE

Test:

1. active mapping version N
2. known saved entry has מילוי value X
3. create modified מילוי mapping N+1
4. rebuild N+1 index
5. while rebuild occurs, N remains active
6. verify old matches remain consistent
7. verify new index completes
8. atomically activate N+1
9. saved entry now matches according to the NEW מילוי value
10. original SavedEntry data remains byte/logically unchanged

---

# 25. TEST CONCURRENT SAVE DURING REBUILD

Explicitly test:

1. begin rebuild for new מילוי mapping version
2. save a new gematria entry while rebuild is in progress
3. catch-up pass indexes the new entry for the pending version
4. activation happens only after the new entry is covered
5. no saved entry is lost
6. no entry is duplicated

---

# 26. REGRESSION TESTS

Run the COMPLETE existing test suite.

Verify no regression in:

- calculator
- standard gematria
- ראשי תיבות
- saved library
- existing matching
- word matching
- Tanach
- Tanach navigation
- מילוי calculator
- מילוי settings
- authentication/session
- database persistence

---

# 27. FEATURE FLAG / SAFE ROLLOUT

If the architecture supports it cleanly, place מילוי matching behind a small internal feature flag during implementation.

This allows:

1. schema/index setup
2. initial backfill verification
3. tests
4. enable matching only after everything is confirmed

Do not add a user-facing settings toggle unless needed.

The feature flag is deployment safety, not product UX.

---

# FINAL ACCEPTANCE SCENARIO

The finished system should support:

1. Client continues using the app normally during/after deployment.
2. Existing saved entries remain intact.
3. Client saves a new phrase normally.
4. Its derived מילוי index is created safely.
5. Later the client types another phrase.
6. Current normal gematria equals the saved phrase's current full מילוי value.
7. Saved phrase appears automatically.
8. Badge clearly says גימטריית מילוי.
9. If it also matches another way, one card shows multiple badges.
10. Client edits the מילוי table.
11. Old matching remains consistent while the new index builds.
12. New index is verified.
13. Active version switches atomically.
14. Matching now uses the new מילוי convention.
15. No saved client record was deleted or rewritten.

---

# REQUIRED IMPLEMENTATION REPORT

Do NOT merely say "implemented."

Report:

1. schema additions
2. whether backup/snapshot was verified
3. saved-entry count before migration
4. saved-entry count after migration
5. saved-word count before/after
6. existing records deleted
7. existing records modified
8. initial מילוי index row count
9. active mapping version
10. how atomic version switching works
11. how concurrent saves during rebuild are handled
12. indexes added
13. exact matching tests run
14. complete test-suite result
15. any remaining risk or limitation

The required safety outcome is:

**existing client data lost = 0**

**existing client data deleted = 0**

**existing saved records rewritten = 0**

Do not perform unrelated refactors.
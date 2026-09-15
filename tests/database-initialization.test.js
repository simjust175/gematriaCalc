import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureMiluiInterpretationSchema } from '../server/miluiInterpretations.js';
import { ensureMiluiMatchingSchema } from '../server/miluiIndex.js';
import { initializeDatabaseRoles } from '../server/databaseStartup.js';

function recordingDatabase(databaseRole) {
  const queries = [];
  return {
    databaseRole,
    queries,
    async query(sql) {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };
}

test('legacy מילוי initializers preserve the pre-multi-user global schema', async () => {
  const legacy = recordingDatabase('legacy');

  await ensureMiluiInterpretationSchema(legacy);
  await ensureMiluiMatchingSchema(legacy);

  const sql = legacy.queries.join('\n').toLowerCase();
  assert.match(sql, /unique\(normalized_text, calculation_mode/);
  assert.match(sql, /primary key \(saved_entry_id, form_id\)/);
  assert.match(sql, /\bid\s+bigserial\s+primary key/);
  assert.match(sql, /on milui_mapping_versions\(status\)/);
  assert.doesNotMatch(sql, /\bowner_id\b/);
  assert.doesNotMatch(sql, /\bapp_accounts\b/);
  assert.doesNotMatch(sql, /\baccount_entitlements\b/);
  assert.doesNotMatch(sql, /owner_.*unique|unique.*owner_/);
});

test('multi-user מילוי initializers contain owner-aware schema while legacy does not', async () => {
  const multiUser = recordingDatabase('multi-user');

  await ensureMiluiInterpretationSchema(multiUser);
  await ensureMiluiMatchingSchema(multiUser);

  const sql = multiUser.queries.join('\n').toLowerCase();
  assert.match(sql, /\bowner_id\b/);
  assert.match(sql, /unique\(owner_id/);
  assert.match(sql, /primary key \(id, owner_id\)/);
  assert.match(sql, /idx_milui_state_owner_unique/);
});

test('startup sends the multi-user initializer only to the multi-user role', async () => {
  const legacy = recordingDatabase('legacy');
  const multiUser = recordingDatabase('multi-user');
  const calls = [];

  const result = await initializeDatabaseRoles({
    legacyDb: legacy,
    multiUserDb: multiUser,
    initializeDb: async options => {
      calls.push(options);
    },
  });

  assert.deepEqual(result, { legacyReady: true, multiUserReady: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].db, legacy);
  assert.equal(calls[0].initializeMultiUser, false);
  assert.equal(calls[1].db, multiUser);
  assert.equal(calls[1].initializeMultiUser, true);
});

test('missing multi-user database leaves legacy initialization independent', async () => {
  const legacy = recordingDatabase('legacy');
  const calls = [];

  const result = await initializeDatabaseRoles({
    legacyDb: legacy,
    multiUserDb: null,
    initializeDb: async options => {
      calls.push(options);
    },
  });

  assert.deepEqual(result, { legacyReady: true, multiUserReady: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].db, legacy);
  assert.equal(calls[0].initializeMultiUser, false);
});
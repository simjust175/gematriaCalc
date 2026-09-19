import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureMiluiInterpretationSchema } from '../server/miluiInterpretations.js';
import { ensureMiluiMatchingSchema } from '../server/miluiIndex.js';
import {
  ensureMiluiInterpretationSchema as ensureMultiUserMiluiInterpretationSchema,
} from '../server/multiUserMiluiInterpretations.js';
import {
  ensureMiluiMatchingSchema as ensureMultiUserMiluiMatchingSchema,
} from '../server/multiUserMiluiIndex.js';
import { initializeDatabaseRoles } from '../server/databaseStartup.js';
import { ensureMiluiPreferences } from '../server/db.js';

function recordingDatabase(databaseRole, schema = {}) {
  const queries = [];
  return {
    databaseRole,
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes("to_regclass('public.saved_entries')")) {
        return { rows: [schema], rowCount: 1 };
      }
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

  await ensureMultiUserMiluiInterpretationSchema(multiUser);
  await ensureMultiUserMiluiMatchingSchema(multiUser);

  const sql = multiUser.queries.join('\n').toLowerCase();
  assert.match(sql, /\bowner_id\b/);
  assert.match(sql, /unique\(owner_id/);
  assert.match(sql, /primary key \(id, owner_id\)/);
  assert.match(sql, /idx_milui_state_owner_unique/);
});

test('startup validates both roles without issuing schema mutations', async () => {
  const legacy = recordingDatabase('legacy', {
    saved_entries: true, session: true, accounts: false, ownership: false, tefillot: false,
  });
  const multiUser = recordingDatabase('multi-user', {
    saved_entries: true, session: true, accounts: true, ownership: true, tefillot: true,
  });

  const result = await initializeDatabaseRoles({
    legacyDb: legacy,
    multiUserDb: multiUser,
  });

  assert.deepEqual(result, { legacyReady: true, multiUserReady: true });
  const sql = [...legacy.queries, ...multiUser.queries].join('\n').toLowerCase();
  assert.doesNotMatch(sql, /\b(create|alter|drop|truncate|insert|update|delete)\b/);
});

test('missing multi-user database leaves legacy initialization independent', async () => {
  const legacy = recordingDatabase('legacy', {
    saved_entries: true, session: true, accounts: false, ownership: false, tefillot: false,
  });

  const result = await initializeDatabaseRoles({
    legacyDb: legacy,
    multiUserDb: null,
  });

  assert.deepEqual(result, { legacyReady: true, multiUserReady: false });
  assert.equal(legacy.queries.length, 1);
});

test('legacy startup does not seed a global preference into an existing owner-aware table', async () => {
  const queries = [];
  const legacy = {
    databaseRole: 'legacy',
    async query(sql) {
      queries.push(sql);
      if (sql.includes('AS saved_entries')) {
        return { rows: [{ saved_entries: 25, saved_words: 44 }], rowCount: 1 };
      }
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ present: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  await ensureMiluiPreferences(legacy);

  const sql = queries.join('\n').toLowerCase();
  assert.doesNotMatch(sql, /insert into milui_preferences/);
  assert.doesNotMatch(sql, /drop\\s+(table|index|constraint)|truncate|delete from/);
});
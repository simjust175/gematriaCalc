import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureMiluiInterpretationSchema } from '../server/miluiInterpretations.js';
import { ensureMiluiMatchingSchema } from '../server/miluiIndex.js';
import { validatePrivateDatabase } from '../server/databaseStartup.js';

function recordingDatabase(schema = {}) {
  const queries = [];
  return {
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
  const legacy = recordingDatabase();

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

test('startup validates the private database without issuing schema mutations', async () => {
  const database = recordingDatabase({
    saved_entries: true, session: true,
  });

  const result = await validatePrivateDatabase(database);
  assert.deepEqual(result, { saved_entries: true, session: true });
  const sql = database.queries.join('\n').toLowerCase();
  assert.doesNotMatch(sql, /\b(create|alter|drop|truncate|insert|update|delete)\b/);
});

test('startup rejects a database without the existing private schema', async () => {
  const database = recordingDatabase({ saved_entries: true, session: false });
  await assert.rejects(
    validatePrivateDatabase(database),
    /missing its required existing schema/
  );
});
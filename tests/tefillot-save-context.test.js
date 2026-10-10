import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { verifyTefillotSaveContext, manualEntryCondition } from '../server/tefillotSaveContext.js';

const text = 'שְׁמַע יִשְׂרָאֵל';
function database(ready = true) {
  return { async query(sql) {
    if (sql.includes('pg_attribute')) return { rows: [{ ready }] };
    if (sql.includes("to_regclass('tefillot_sources')")) return { rows: [{ sources: true, units: true }] };
    if (sql.includes('SELECT EXISTS')) return { rows: [{ populated: true }] };
    return { rows: [{
      id: '9', hebrew_text: text, occasion_slug: 'weekday', occasion_label: 'חול',
      service_slug: 'shacharit', service_label: 'שחרית', section_key: 'shema',
      section_label: 'שמע', source_reference: 'Siddur Sefard 1', license: 'CC-BY',
    }] };
  } };
}
test('Tefillot saves derive pointed text/calculation and source metadata from the corpus', async () => {
  const cursor = createTanachCursor(text);
  const range = { unitId: 9, start: 0, end: cursor.count - 1, sectionLabel: 'forged' };
  const saved = await verifyTefillotSaveContext('שמע ישראל', range, database());
  assert.equal(saved.originalText, text);
  assert.equal(saved.calculated.fullGematria, 951);
  assert.equal(saved.context.sectionLabel, 'שמע');
  assert.equal(saved.context.sourceReference, 'Siddur Sefard 1');
});
test('Tefillot save verifier rejects invalid coordinates and mismatched text', async () => {
  for (const context of [
    {}, { unitId: 0, start: 0, end: 2 }, { unitId: 9, start: null, end: 2 },
    { unitId: 9, start: true, end: 2 }, { unitId: 9, start: 3, end: 2 },
  ]) {
    await assert.rejects(verifyTefillotSaveContext(text, context, database()), { code: 'invalid_tefillot_context' });
  }
  await assert.rejects(verifyTefillotSaveContext(text, { unitId: 9, start: 0, end: 999 }, database()), { code: 'tefillot_range_mismatch' });
  await assert.rejects(verifyTefillotSaveContext('לא תואם', { unitId: 9, start: 0, end: 2 }, database()), { code: 'tefillot_range_mismatch' });
});
test('unmigrated save schema fails explicitly and manual predicate stays backward-compatible', async () => {
  await assert.rejects(verifyTefillotSaveContext(text, { unitId: 9, start: 0, end: 2 }, database(false)), {
    code: 'tefillot_save_schema_required',
  });
  assert.match(manualEntryCondition('entry'), /to_jsonb\(entry\)/);
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';

if (!/^tanach_reader_e2e_\d+$/.test(process.env.E2E_SCHEMA || '')) {
  throw new Error('Use scripts/run-e2e.js with E2E_TEFILLOT_SAVES=true; never run against the app database.');
}
process.env.APP_PASSWORD = 'isolated-tefillot-save-test';
process.env.SESSION_SECRET = 'isolated-tefillot-save-session';
process.env.TEFILLOT_ENABLED = 'true';
const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');
after(() => pool.end());

test('Tefillot and Tanach range/link saves, duplicates, persistent state, removal and isolation', async () => {
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema, process.env.E2E_SCHEMA);
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ password: 'isolated-tefillot-save-test' })).status, 200);
  const unit = (await pool.query('SELECT * FROM tefillot_units ORDER BY id LIMIT 1')).rows[0];
  const cursor = createTanachCursor(unit.hebrew_text);
  const context = { unitId: Number(unit.id), start: 0, end: cursor.count - 1 };
  const text = cursor.range(context.start, context.end).text;
  const verse = (await agent.get('/api/tanach/verse').query({ book: 'Genesis', chapter: 1, verse: 1 })).body.verse;
  const verseCursor = createTanachCursor(verse.display_text);
  const tanach = { bookSlug: 'Genesis', chapter: 1, verse: 1, start: 0, end: verseCursor.count - 1 };
  const tanachText = verseCursor.range(tanach.start, tanach.end).text;
  assert.equal((await request(app).post('/api/entries').send({ originalText: text, tefillotContext: context })).status, 401);
  assert.equal((await request(app).get('/api/entries/saved-ranges').query({ keys: '[]' })).status, 401);
  assert.equal((await agent.post('/api/entries').send({
    originalText: text, tefillotContext: context, tanachContext: tanach,
  })).status, 400);
  assert.equal((await agent.post('/api/entries').send({
    originalText: 'מזויף', tefillotContext: context,
  })).status, 400);
  const saved = await agent.post('/api/entries').send({
    originalText: text, fullGematria: 1,
    tefillotContext: { ...context, sourceReference: 'forged', sectionLabel: 'forged' },
  });
  assert.equal(saved.status, 200);
  const duplicate = await agent.post('/api/entries').send({ originalText: text, tefillotContext: context });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.id, saved.body.id);
  const concurrent = await Promise.all([1, 2].map(() =>
    agent.post('/api/entries').send({ originalText: text, tefillotContext: context })));
  assert.ok(concurrent.every(response => response.status === 409));
  const manual = await agent.post('/api/entries').send({ originalText: text });
  assert.equal(manual.status, 200, 'same text remains a distinct manual calculation');
  assert.notEqual(manual.body.id, saved.body.id);
  const tanachSaved = await agent.post('/api/entries').send({ originalText: tanachText, tanachContext: tanach });
  assert.equal(tanachSaved.status, 200);
  assert.equal((await agent.post('/api/entries').send({ originalText: tanachText, tanachContext: tanach })).status, 409);

  const parentOriginalText = 'בדיקת התאמות תפילות ותנך';
  const prayerMatch = { originalText: text, tefillotContext: context, reasonCode: 'full_gematria' };
  const bibleMatch = { originalText: tanachText, tanachContext: tanach, reasonCode: 'initials_text' };
  const bulk = await agent.post('/api/entries/curated-matches').send({
    parentOriginalText, matches: [prayerMatch, bibleMatch, prayerMatch],
  });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.body.matches.length, 2);
  assert.equal(bulk.body.parentCreated, true);
  const merged = await agent.post('/api/entries/curated-matches').send({
    parentOriginalText, matches: [{ ...prayerMatch, reasonCode: 'finals_text' }],
  });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.parentCreated, false);
  assert.deepEqual(merged.body.matches[0].reasonCodes, ['finals_text', 'full_gematria']);
  const reload = await agent.get('/api/entries').query({ limit: 100 });
  const prayerEntry = reload.body.entries.find(entry => entry.id === saved.body.id);
  assert.equal(prayerEntry.sourceType, 'tefillot');
  assert.equal(prayerEntry.tefillotContext.sourceReference, unit.source_reference);
  assert.equal(prayerEntry.tefillotContext.occasionLabel, unit.occasion_label);
  assert.equal(prayerEntry.tefillotContext.serviceLabel, unit.service_label);
  assert.equal(prayerEntry.tefillotContext.sectionLabel, unit.section_label);
  assert.notEqual(prayerEntry.full_gematria, 1);
  const parent = reload.body.entries.find(entry => entry.id === bulk.body.parentId);
  assert.equal(parent.curated_match_count, 2);
  const child = parent.curated_matches.find(match => match.sourceType === 'tefillot');
  const bibleChild = parent.curated_matches.find(match => match.tanachContext);
  assert.equal(child.tefillotContext.unitId, context.unitId);
  assert.deepEqual(child.reasonCodes, ['finals_text', 'full_gematria']);
  assert.equal((await agent.get('/api/entries').query({ grouped: true, limit: 100 })).status, 200);
  const keys = [{ tefillotContext: context }, { tanachContext: tanach }];
  const state = await agent.get('/api/entries/saved-ranges').query({ keys: JSON.stringify(keys) });
  assert.equal(state.status, 200);
  assert.equal(state.body.saved.length, 2);
  assert.ok(state.body.saved.some(row => row.id === saved.body.id));
  assert.equal((await agent.delete(`/api/entries/${manual.body.id}/curated-matches/${child.id}?source=tefillot`)).status, 404);
  assert.equal((await agent.delete(`/api/entries/${parent.id}/curated-matches/${child.id}?source=tefillot`)).status, 200);
  const afterRemoval = (await agent.get('/api/entries').query({ search: parentOriginalText })).body.entries[0];
  assert.equal(afterRemoval.curated_match_count, 1);
  assert.equal(afterRemoval.curated_matches[0].id, bibleChild.id);
  assert.equal((await agent.delete(`/api/entries/${parent.id}/curated-matches/${bibleChild.id}`)).status, 200);
  assert.equal((await agent.post('/api/entries/curated-matches').send({ parentOriginalText, matches: [prayerMatch] })).status, 200);
  await agent.delete(`/api/entries/${parent.id}`);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM curated_tefillot_matches WHERE parent_id=$1', [parent.id])).rows[0].count, 0);
  await agent.delete(`/api/entries/${saved.body.id}`);
  const deletedState = await agent.get('/api/entries/saved-ranges').query({ keys: JSON.stringify(keys) });
  assert.equal(deletedState.body.saved.length, 1);
  assert.equal(deletedState.body.saved[0].id, tanachSaved.body.id);
  const failedParent = 'לא יישמר הורה של התאמה שגויה';
  assert.equal((await agent.post('/api/entries/curated-matches').send({
    parentOriginalText: failedParent, matches: [bibleMatch, { ...prayerMatch, originalText: 'מזויף' }],
  })).status, 400);
  assert.equal((await agent.get('/api/entries').query({ search: failedParent })).body.entries.length, 0);
  process.env.TEFILLOT_ENABLED = 'false';
  assert.equal((await agent.post('/api/entries').send({ originalText: text, tefillotContext: context })).status, 503);
  process.env.TEFILLOT_ENABLED = 'true';
});

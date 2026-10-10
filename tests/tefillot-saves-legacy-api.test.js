import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
if (!/^tanach_reader_e2e_\d+$/.test(process.env.E2E_SCHEMA || '')) throw new Error('Disposable test schema required');
process.env.APP_PASSWORD = 'legacy-save-readiness-test';
process.env.SESSION_SECRET = 'legacy-save-readiness-session';
process.env.TEFILLOT_ENABLED = 'true';
const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');
const { tefillotSaveSchemaReady } = await import('../server/tefillotSaveContext.js');
after(() => pool.end());
test('unmigrated app retains library/manual saves; prayer save returns explicit 503 without schema/data changes', async () => {
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema, process.env.E2E_SCHEMA);
  assert.equal(await tefillotSaveSchemaReady(pool), false);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'legacy-save-readiness-test' });
  assert.equal((await agent.get('/api/entries')).status, 200);
  const body = { originalText: 'בדיקת תפילה ללא מיגרציה', tefillotContext: { unitId: 1, start: 0, end: 2 } };
  const saved = await agent.post('/api/entries').send(body);
  assert.equal(saved.status, 503);
  assert.equal(saved.body.error, 'tefillot_save_schema_required');
  const linked = await agent.post('/api/entries/curated-matches').send({
    parentOriginalText: body.originalText, matches: [{ ...body, reasonCode: 'full_gematria' }],
  });
  assert.equal(linked.status, 503);
  assert.equal(linked.body.error, 'tefillot_save_schema_required');
  assert.equal((await agent.get('/api/entries').query({ parentOriginalText: body.originalText })).body.entries.length, 0);
  const manual = await agent.post('/api/entries').send({ originalText: body.originalText });
  assert.equal(manual.status, 200);
  assert.equal(await tefillotSaveSchemaReady(pool), false);
  await agent.delete(`/api/entries/${manual.body.id}`);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { writeFile, mkdir } from 'node:fs/promises';
import { parseGematriaSearchQuery, exportTanachGematria } from '../server/tanachGematriaDiscovery.js';

if (!/^tanach_reader_e2e_[1-9]\d*$/.test(process.env.E2E_SCHEMA || '')) {
  throw new Error('Use scripts/run-e2e.js; PDF acceptance requires the disposable schema');
}
process.env.APP_PASSWORD = 'pdf-export-test-password';
process.env.SESSION_SECRET = 'pdf-export-test-session';
const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');
const agent = request.agent(app);
before(async () => {
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema, process.env.E2E_SCHEMA);
  assert.equal((await agent.post('/api/auth/login').send({ password: process.env.APP_PASSWORD })).status, 200);
});
after(() => pool.end());
function binary(response, done) {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => done(null, Buffer.concat(chunks)));
  response.on('error', done);
}

test('PDF export enforces authentication, canonical query validation and truthful original targets', async () => {
  const body = { originalText: '502', query: { value: '502', parsha_scope: 'torah' } };
  assert.equal((await request(app).post('/api/tanach/gematria-matches/export.pdf').send(body)).status, 401);
  assert.equal((await agent.post('/api/tanach/gematria-matches/export.pdf').send({ ...body, originalText: '503' })).status, 400);
  assert.equal((await agent.post('/api/tanach/gematria-matches/export.pdf').send({ ...body, query: { value: '502', parsha_id: 'missing' } })).status, 400);
});

test('real Hebrew PDF exports every 502 Torah match instead of the visible page and follows selected Parsha scope', async () => {
  const query = { value: '502', parsha_scope: 'torah' };
  const all = await exportTanachGematria(pool, parseGematriaSearchQuery(query));
  assert.equal(all.results.length, all.total);
  assert.ok(all.total > 50);
  const response = await agent.post('/api/tanach/gematria-matches/export.pdf')
    .send({ originalText: '502', query }).buffer(true).parse(binary);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^application\/pdf/);
  assert.equal(Number(response.headers['x-result-count']), all.total);
  assert.equal(response.headers['x-parsha-scope'], 'torah');
  assert.equal(response.body.subarray(0, 5).toString(), '%PDF-');
  assert.ok((response.body.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length > 1);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/parsha-502.pdf', response.body);
  const selectedQuery = { ...query, parsha_id: 'bereshit', type: 'whole_word' };
  const selected = await exportTanachGematria(pool, parseGematriaSearchQuery(selectedQuery));
  const scoped = await agent.post('/api/tanach/gematria-matches/export.pdf')
    .send({ originalText: '502', query: selectedQuery }).buffer(true).parse(binary);
  assert.equal(scoped.status, 200);
  assert.equal(Number(scoped.headers['x-result-count']), selected.total);
  assert.equal(scoped.headers['x-parsha-scope'], 'bereshit');
  assert.equal(scoped.body.subarray(0, 5).toString(), '%PDF-');
  await writeFile('artifacts/parsha-502-bereshit.pdf', scoped.body);
});

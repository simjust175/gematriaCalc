import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdir, writeFile } from 'node:fs/promises';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { computeAll } from '../src/composables/useGematria.js';
import { TANACH_PARSHIOT } from '../server/tanachParshiot.js';
import { getCurrentWeeklyParshah } from '../server/tanachWeeklyParsha.js';

if (!/^tanach_reader_e2e_[1-9]\d*$/.test(process.env.E2E_SCHEMA || '')) throw new Error('Use the isolated E2E harness');
process.env.APP_PASSWORD = 'saved-tools-test-password';
process.env.SESSION_SECRET = 'saved-tools-test-session';
process.env.TEFILLOT_ENABLED = 'true';
const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');
const agent = request.agent(app);
const parents = new Set();
let original;
async function snapshot() {
  const output = {};
  for (const table of ['saved_entries', 'saved_words', 'curated_matches', 'curated_tefillot_matches']) {
    output[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return output;
}
async function saveVerse(book, chapter, verse) {
  const text = (await pool.query('SELECT display_text FROM tanach_verses WHERE book_slug=$1 AND chapter=$2 AND verse=$3', [book, chapter, verse])).rows[0].display_text;
  const end = computeAll(text).words[0].word.length - 1;
  const word = createTanachCursor(text).range(0, end).text;
  const response = await agent.post('/api/entries/curated-matches').send({
    parentOriginalText: String(computeAll(word).fullGematria),
    matches: [{ originalText: word, reasonCode: 'full_gematria', tanachContext: { bookSlug: book, chapter, verse, start: 0, end } }],
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  if (response.body.parentCreated) parents.add(response.body.parentId);
  return response.body;
}
before(async () => {
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema, process.env.E2E_SCHEMA);
  original = await snapshot();
  assert.equal((await agent.post('/api/auth/login').send({ password: process.env.APP_PASSWORD })).status, 200);
});
after(async () => {
  try {
    for (const parent of parents) await agent.delete(`/api/entries/${parent}`);
    assert.deepEqual(await snapshot(), original);
  } finally { await pool.end(); }
});
function belongsTo(row, portion) {
  const position = row.tanach_chapter * 1000 + row.tanach_verse;
  return row.tanach_book_slug === portion.start.bookSlug
    && position >= portion.start.chapter * 1000 + portion.start.verse
    && position <= portion.end.chapter * 1000 + portion.end.verse;
}
function binary(response, done) {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => done(null, Buffer.concat(chunks)));
  response.on('error', done);
}

test('saved-only Parsha/weekly tools preserve pagination, canonical order, source filters and every existing record', { timeout: 90_000 }, async () => {
  const verses = (await pool.query(`SELECT book_slug, chapter, verse FROM tanach_verses
    WHERE book_slug='Genesis' AND chapter IN (1, 7) ORDER BY chapter, verse`)).rows;
  for (const row of [...verses].reverse()) await saveVerse(row.book_slug, row.chapter, row.verse);
  const weekly = getCurrentWeeklyParshah();
  for (const id of weekly?.ids || []) {
    const ref = TANACH_PARSHIOT.find(portion => portion.id === id).start;
    await saveVerse(ref.bookSlug, ref.chapter, ref.verse);
  }
  await saveVerse('Isaiah', 1, 1);
  const prayer = (await pool.query('SELECT id, hebrew_text FROM tefillot_units ORDER BY id LIMIT 1')).rows[0];
  const end = computeAll(prayer.hebrew_text).words[0].word.length - 1;
  const word = createTanachCursor(prayer.hebrew_text).range(0, end).text;
  const saving = await agent.post('/api/entries/curated-matches').send({ parentOriginalText: String(computeAll(word).fullGematria),
    matches: [{ originalText: word, reasonCode: 'full_gematria', tefillotContext: { unitId: prayer.id, start: 0, end } }] });
  assert.equal(saving.status, 200, JSON.stringify(saving.body));
  if (saving.body.parentCreated) parents.add(saving.body.parentId);
  const preserved = await snapshot();
  const all = (await agent.get('/api/entries/curated-matches')).body;
  const first = (await agent.get('/api/entries/curated-matches').query({ parsha_scope: 'torah', limit: 40 })).body;
  assert.ok(first.total > 40);
  assert.equal(first.matches.length, 40);
  assert.ok(first.matches.every(row => row.sourceType === 'tanach' && row.parshaId));
  const second = (await agent.get('/api/entries/curated-matches').query({ parsha_scope: 'torah', offset: 40 })).body;
  const keys = [...first.matches, ...second.matches].map(row => row.key);
  assert.equal(new Set(keys).size, first.total);
  assert.ok(all.total >= first.total + 2, 'outside-Torah and prayer relationships remain available unfiltered');
  const selected = (await agent.get('/api/entries/curated-matches').query({ parsha_id: 'noach', matchType: 'full_gematria' })).body;
  assert.equal(selected.total, preserved.curated_matches.filter(row => belongsTo(row, TANACH_PARSHIOT.find(portion => portion.id === 'noach'))).length);
  assert.ok(selected.matches.every(row => row.parshaId === 'noach'));
  const positions = selected.matches.map(row => row.tanachContext.chapter * 1000 + row.tanachContext.verse);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const current = (await agent.get('/api/entries/curated-matches').query({ parsha: 'current' })).body;
  assert.deepEqual(current.weeklyParshah?.ids, weekly?.ids);
  assert.equal(current.total, preserved.curated_matches.filter(row => weekly?.portions.some(portion => belongsTo(row, portion))).length);
  assert.ok(current.matches.every(row => weekly.ids.includes(row.parshaId)));
  const absent = (await agent.get('/api/entries/curated-matches').query({ parsha_id: 'vezot-haberakhah' })).body;
  assert.equal(absent.total, 0);
  assert.equal(absent.matches.length, 0);
  const prayers = (await agent.get('/api/entries/curated-matches').query({ source: 'tefillot' })).body;
  assert.equal(prayers.total, 1);
  assert.deepEqual(await snapshot(), preserved);
});

test('real Hebrew PDF exports every filtered saved relationship beyond page one and never adds discoveries', { timeout: 90_000 }, async () => {
  const query = { parsha_scope: 'torah', matchType: 'full_gematria' };
  const expected = (await agent.get('/api/entries/curated-matches').query(query)).body;
  const preserved = await snapshot();
  const response = await agent.post('/api/entries/curated-matches/export.pdf')
    .send({ query: { ...query, limit: 1, offset: 9999 } }).buffer(true).parse(binary);
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-collection'], 'saved-matches');
  assert.equal(Number(response.headers['x-result-count']), expected.total);
  assert.ok(expected.total > 40);
  assert.equal(response.body.subarray(0, 5).toString(), '%PDF-');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/toolbar-saved-collection.pdf', response.body);
  const selectedQuery = { parsha_id: 'noach', search: 'וַ', matchType: 'full_gematria' };
  const filtered = (await agent.get('/api/entries/curated-matches').query(selectedQuery)).body;
  assert.ok(filtered.total > 0 && filtered.total < expected.total);
  const scoped = await agent.post('/api/entries/curated-matches/export.pdf').send({ query: selectedQuery }).buffer(true).parse(binary);
  assert.equal(scoped.status, 200);
  assert.equal(Number(scoped.headers['x-result-count']), filtered.total);
  assert.deepEqual(await snapshot(), preserved, 'PDF generation must be read-only');
  const all = (await agent.get('/api/entries/curated-matches')).body;
  const allPdf = await agent.post('/api/entries/curated-matches/export.pdf').send({ query: {} }).buffer(true).parse(binary);
  assert.equal(allPdf.status, 200);
  assert.equal(Number(allPdf.headers['x-result-count']), all.total, 'unfiltered PDF keeps saved prayers and Neviim too');
  assert.ok(all.total > expected.total);
  assert.equal((await request(app).post('/api/entries/curated-matches/export.pdf').send({ query })).status, 401);
  assert.equal((await agent.post('/api/entries/curated-matches/export.pdf').send({ query: { parsha: 'fake' } })).status, 400);
});

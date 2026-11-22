import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { TANACH_PARSHIOT } from '../server/tanachParshiot.js';
import { findGematriaRanges, findWordEdgeRanges } from '../server/tanachGematriaSearch.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { computeAll } from '../src/composables/useGematria.js';

if (!/^tanach_reader_e2e_[1-9]\d*$/.test(process.env.E2E_SCHEMA || '')) {
  throw new Error('Run Parsha acceptance through scripts/run-e2e.js with a disposable schema');
}
process.env.APP_PASSWORD = 'parsha-discovery-test-password';
process.env.SESSION_SECRET = 'parsha-discovery-test-session';
const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');
const agent = request.agent(app);
const books = new Map(['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']
  .map((book, index) => [book, index + 1]));
const portions = new Map(TANACH_PARSHIOT.map((portion) => [portion.id, portion]));
let corpus;

before(async () => {
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema, process.env.E2E_SCHEMA);
  assert.equal((await agent.post('/api/auth/login').send({ password: process.env.APP_PASSWORD })).status, 200);
  corpus = (await pool.query(`
    SELECT v.book_slug, b.canonical_order, v.chapter, v.verse, v.display_text
    FROM tanach_verses v JOIN tanach_books b ON b.slug = v.book_slug
    WHERE b.canonical_order BETWEEN 1 AND 5
    ORDER BY b.canonical_order, v.chapter, v.verse
  `)).rows;
});
after(() => pool.end());

function containingPortions(verse) {
  const position = verse.chapter * 1000 + verse.verse;
  return TANACH_PARSHIOT.filter((portion) => portion.start.bookSlug === verse.book_slug
    && position >= portion.start.chapter * 1000 + portion.start.verse
    && position <= portion.end.chapter * 1000 + portion.end.verse);
}
function key(row) {
  const context = row.tanachContext || row;
  return [context.bookSlug, context.chapter, context.verse, context.start, context.end].join(':');
}
function compare(left, right) {
  return books.get(left.bookSlug) - books.get(right.bookSlug)
    || left.chapter - right.chapter || left.verse - right.verse
    || left.start - right.start || left.end - right.end;
}
const oracleCache = new Map();
function oracle(query) {
  const signature = JSON.stringify([query.method || 'gematria', query.value,
    query.sequence, query.order_independent || 'false']);
  if (!oracleCache.has(signature)) {
    const all = [];
    for (const verse of corpus) {
      const method = query.method || 'gematria';
      const found = method === 'gematria'
        ? findGematriaRanges(verse.display_text, Number(query.value))
        : findWordEdgeRanges(verse.display_text, query.sequence, method,
          [...query.sequence].length, query.order_independent === 'true');
      const portion = containingPortions(verse)[0];
      const letterCount = createTanachCursor(verse.display_text).count;
      for (const range of found) all.push({
        bookSlug: verse.book_slug, chapter: verse.chapter, verse: verse.verse,
        start: range.start, end: range.end, text: range.text,
        type: range.classification, parshaId: portion.id,
        wholeVerse: method === 'gematria' && range.start === 0 && range.end === letterCount - 1,
      });
    }
    oracleCache.set(signature, all.sort(compare));
  }
  return oracleCache.get(signature);
}
function matchingRows(query, all = oracle(query)) {
  return all.filter((row) => (!query.parsha_id || row.parshaId === query.parsha_id)
    && (query.type === 'whole_verse' ? row.wholeVerse
      : query.type && query.type !== 'all' ? row.type === query.type : row.type !== 'partial'));
}
async function discover(query) {
  const response = await agent.get('/api/tanach/gematria-matches')
    .query({ parsha_scope: 'torah', limit: 50, ...query });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}
async function allPages(query) {
  const first = await discover({ ...query, page: 1 });
  const results = [...first.results];
  let page = 1;
  let current = first;
  while (current.hasMore) {
    assert.ok(page < 1000, 'pagination must terminate');
    current = await discover({ ...query, page: ++page });
    assert.equal(current.total, first.total);
    assert.deepEqual(current.parshaBreakdown, first.parshaBreakdown);
    assert.ok(current.results.length, 'a remaining page must contain results');
    results.push(...current.results);
  }
  return { ...first, results, pages: page };
}

test('every imported Torah verse belongs to exactly one standard portion, including both sides of all boundaries', async (t) => {
  assert.ok(corpus.length > 5000, 'exercise the complete imported Torah, not a synthetic chapter');
  const covered = new Set();
  for (const verse of corpus) {
    const membership = containingPortions(verse);
    assert.equal(membership.length, 1, `${verse.book_slug} ${verse.chapter}:${verse.verse}`);
    covered.add(membership[0].id);
  }
  assert.equal(covered.size, 54);
  t.diagnostic(`${corpus.length} actual imported Torah verses each belong to one of 54 portions`);
  for (const portion of TANACH_PARSHIOT) for (const boundary of [portion.start, portion.end]) {
    const verse = corpus.find((item) => item.book_slug === boundary.bookSlug
      && item.chapter === boundary.chapter && item.verse === boundary.verse);
    assert.ok(verse, `${portion.id} boundary must exist in the imported corpus`);
    assert.deepEqual(containingPortions(verse).map((item) => item.id), [portion.id]);
  }
  const before = (await pool.query('SELECT * FROM tanach_parshiot ORDER BY canonical_order')).rows;
  const catalog = await agent.get('/api/tanach/books');
  assert.equal(catalog.status, 200);
  for (const row of catalog.body.parshiot) {
    const portion = portions.get(row.id);
    assert.deepEqual([row.start_book_slug, row.start_chapter, row.start_verse,
      row.end_book_slug, row.end_chapter, row.end_verse],
    [portion.start.bookSlug, portion.start.chapter, portion.start.verse,
      portion.end.bookSlug, portion.end.chapter, portion.end.verse]);
  }
  assert.deepEqual((await pool.query('SELECT * FROM tanach_parshiot ORDER BY canonical_order')).rows, before,
    'corrected catalog boundaries must not migrate or rewrite existing private metadata');
});

test('502 distribution includes all 54 portions before pagination and every page retains canonical Torah/range order', { timeout: 90_000 }, async (t) => {
  assert.equal((await request(app).get('/api/tanach/gematria-matches')
    .query({ value: 502, parsha_scope: 'torah' })).status, 401);
  const query = { value: 502, type: 'all' };
  const expected = matchingRows(query);
  assert.ok(expected.length > 50, 'the acceptance query must span multiple pages');
  const data = await allPages(query);
  assert.equal(data.total, expected.length);
  t.diagnostic(`502: ${data.total} genuine Torah ranges across ${data.pages} canonical pages`);
  assert.ok(data.pages > 1);
  assert.deepEqual(data.results.map(key), expected.map(key));
  assert.equal(new Set(data.results.map(key)).size, expected.length, 'no duplicated range between pages');
  assert.equal(data.parshaBreakdown.books.length, 5);
  assert.deepEqual(data.parshaBreakdown.books.map((book) => book.bookSlug), [...books.keys()]);
  const breakdown = data.parshaBreakdown.books.flatMap((book) => book.parshiot);
  assert.deepEqual(breakdown.map((portion) => portion.id), TANACH_PARSHIOT.map((portion) => portion.id));
  assert.equal(breakdown.reduce((sum, portion) => sum + portion.total, 0), data.total);
  assert.equal(data.parshaBreakdown.total, data.total);
  for (const portion of breakdown) {
    const all = oracle(query).filter((row) => row.parshaId === portion.id);
    assert.equal(portion.total, all.filter((row) => row.type !== 'partial').length, portion.id);
    for (const type of ['whole_word', 'whole_phrase', 'partial']) {
      assert.equal(portion.counts[type], all.filter((row) => row.type === type).length, `${portion.id}:${type}`);
    }
    assert.equal(portion.counts.whole_verse, all.filter((row) => row.wholeVerse).length);
  }
  for (const row of data.results) {
    assert.ok(books.has(row.bookSlug), 'Torah mode must exclude Neviim, Ketuvim and prayers');
    assert.equal(computeAll(row.text).fullGematria, 502);
    assert.equal(row.gematria, 502);
    const portion = portions.get(row.parshaId);
    assert.ok(portion);
    assert.equal(row.parshaName, portion.nameHe);
    assert.equal(row.parshaSequence, portion.canonicalOrder);
    assert.equal(row.bookOrder, books.get(row.bookSlug));
  }
});

test('specific portions, type filters, initial/final letters and effective kollel target retain engine semantics', { timeout: 90_000 }, async () => {
  const allQuery = { value: 502, type: 'all' };
  const baseline = await discover(allQuery);
  for (const parshaId of ['bereshit', 'noach']) {
    const query = { ...allQuery, parsha_id: parshaId };
    const data = await allPages(query);
    assert.deepEqual(data.results.map(key), matchingRows(query).map(key));
    assert.ok(data.total > 0);
    assert.deepEqual(data.parshaBreakdown, baseline.parshaBreakdown, 'choosing one portion must retain the global distribution');
  }
  for (const query of [
    { value: 502, type: 'whole_word' },
    { value: 502, type: 'whole_phrase' },
    { value: 502, type: 'partial' },
    { value: 503, type: 'all' },
    { value: 2701, type: 'whole_verse' },
    { method: 'initials', sequence: 'בב', type: 'all' },
    { method: 'finals', sequence: 'תא', type: 'all', order_independent: 'true' },
  ]) {
    const data = await discover(query);
    const expected = matchingRows(query);
    assert.equal(data.total, expected.length, JSON.stringify(query));
    assert.deepEqual(data.results.map(key), expected.slice(0, 50).map(key));
    assert.equal(data.parshaBreakdown.total, expected.length);
    if (query.value) assert.equal(data.target, query.value);
  }
});

test('saved Parsha filtering derives each child occurrence and preserves its parent, siblings, numbers and exact source', async () => {
  const query = { value: 502, type: 'all' };
  const selected = ['bereshit', 'noach'].map((id) => matchingRows({ ...query, parsha_id: id })[0]);
  assert.ok(selected.every(Boolean));
  const payload = {
    parentOriginalText: '502',
    matches: selected.map((row) => ({
      originalText: row.text, reasonCode: 'full_gematria',
      tanachContext: { bookSlug: row.bookSlug, chapter: row.chapter, verse: row.verse, start: row.start, end: row.end },
    })),
  };
  let saved;
  let originalParentParsha;
  const existingMatches = new Set((await pool.query(`
    SELECT cm.id FROM curated_matches cm JOIN saved_entries se ON se.id=cm.parent_id
    WHERE se.normalized_text='502' AND se.tanach_book_slug IS NULL
  `)).rows.map((row) => row.id));
  try {
    const response = await agent.post('/api/entries/curated-matches').send(payload);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    saved = response.body;
    assert.equal(saved.matches.length, 2);
    assert.equal(saved.parentCreated, true, 'the disposable acceptance namespace must start without this test parent');
    const parent = (await pool.query('SELECT * FROM saved_entries WHERE id=$1', [saved.parentId])).rows[0];
    originalParentParsha = parent.parsha_id;
    await pool.query('UPDATE saved_entries SET parsha_id=$2 WHERE id=$1', [saved.parentId, 'vayelech']);
    const duplicate = await agent.post('/api/entries/curated-matches').send(payload);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.parentId, saved.parentId);
    assert.deepEqual(duplicate.body.matches.map((match) => match.id).sort(), saved.matches.map((match) => match.id).sort());
    for (const parshaId of ['bereshit', 'noach']) {
      const response = await agent.get('/api/entries/curated-matches')
        .query({ parsha_id: parshaId, search: '502', sort: 'recent', limit: 1 });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const row = response.body.matches.find((match) => match.parentId === saved.parentId);
      assert.ok(row, parshaId);
      assert.equal(row.parshaId, parshaId);
      assert.equal(row.parentOriginalText, '502');
      assert.equal(row.gematriaValue, 502);
      assert.equal(key(row), key(selected.find((item) => item.parshaId === parshaId)));
      assert.ok(response.body.counts.matches >= 2, 'global tab count remains separate from filtered total');
      const source = await agent.get('/api/tanach/verse').query({
        book: row.tanachContext.bookSlug, chapter: row.tanachContext.chapter, verse: row.tanachContext.verse,
      });
      assert.equal(source.status, 200);
      assert.equal(createTanachCursor(source.body.verse.display_text)
        .range(row.tanachContext.start, row.tanachContext.end).text, row.originalText);
    }
    const removed = saved.matches[1];
    assert.equal((await agent.delete(`/api/entries/${saved.parentId}/curated-matches/${removed.id}`)).status, 200);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM curated_matches WHERE parent_id=$1', [saved.parentId])).rows[0].count, 1);
    const unchanged = (await pool.query('SELECT * FROM saved_entries WHERE id=$1', [saved.parentId])).rows[0];
    for (const field of ['original_text', 'normalized_text', 'full_gematria', 'initials_gematria', 'finals_gematria']) {
      assert.equal(unchanged[field], parent[field], field);
    }
  } finally {
    if (saved?.parentCreated) await agent.delete(`/api/entries/${saved.parentId}`);
    else if (saved) {
      await pool.query('UPDATE saved_entries SET parsha_id=$2 WHERE id=$1', [saved.parentId, originalParentParsha]);
      for (const match of saved.matches) if (!existingMatches.has(match.id)) {
        await agent.delete(`/api/entries/${saved.parentId}/curated-matches/${match.id}`);
      }
    }
  }
});

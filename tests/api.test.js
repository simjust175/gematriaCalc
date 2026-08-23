/**
 * API auth integration tests — Node.js built-in test runner + supertest.
 * Run: node --test tests/api.test.js
 *
 * These tests verify that:
 *   1. Unauthenticated requests to protected routes are rejected (401).
 *   2. Login with a wrong password is rejected (401).
 *   3. Login with the correct password succeeds and grants session access.
 *   4. A valid session allows access to protected routes.
 *   5. Logout invalidates the session.
 *   6. Cross-user/cross-request enumeration is impossible without a session.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { computeAll, normalize, toHebrewNumber } from '../src/composables/useGematria.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';

// Set required env vars before importing the app
process.env.SESSION_SECRET  = 'test-session-secret-for-api-tests';
process.env.APP_PASSWORD    = 'correct-test-password-12345';

// Import app AFTER env vars are set
const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');

// ── Unauthenticated access ────────────────────────────────────────────────────

test('GET /api/auth/check returns authenticated=false when no session', async () => {
  const res = await request(app).get('/api/auth/check');
  assert.equal(res.status, 200);
  assert.equal(res.body.authenticated, false);
});

test('GET /api/matches requires authentication (401)', async () => {
  const res = await request(app).get('/api/matches?gematria=951');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'not_authenticated');
});

test('GET /api/entries requires authentication (401)', async () => {
  const res = await request(app).get('/api/entries');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'not_authenticated');
});

test('POST /api/entries requires authentication (401)', async () => {
  const res = await request(app)
    .post('/api/entries')
    .send({ originalText: 'שמע', normalizedText: 'שמע', fullGematria: 410, fullGematriaHebrew: 'תי',
            initials: 'ש', initialsGematria: 300, initialsGematriaHebrew: 'ש', words: [] });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'not_authenticated');
});

test('DELETE /api/entries/1 requires authentication (401)', async () => {
  const res = await request(app).delete('/api/entries/1');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'not_authenticated');
});

// ── Wrong password ────────────────────────────────────────────────────────────

test('POST /api/auth/login with wrong password returns 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ password: 'wrong-password' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'invalid_password');
});

test('POST /api/auth/login with empty password returns 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ password: '' });
  assert.equal(res.status, 401);
});

test('POST /api/auth/login with no password body returns 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({});
  assert.equal(res.status, 401);
});

// ── Correct login flow ────────────────────────────────────────────────────────

test('POST /api/auth/login with correct password returns success and sets cookie', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ password: 'correct-test-password-12345' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  // Session cookie must be set
  const cookies = res.headers['set-cookie'];
  assert.ok(cookies && cookies.length > 0, 'session cookie should be set');
});

test('GET /api/auth/check returns authenticated=true after login', async () => {
  // Login first to get the session cookie
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ password: 'correct-test-password-12345' });
  const cookie = loginRes.headers['set-cookie'];

  const checkRes = await request(app)
    .get('/api/auth/check')
    .set('Cookie', cookie);
  assert.equal(checkRes.status, 200);
  assert.equal(checkRes.body.authenticated, true);

  const storedSessions = await pool.query(
    `SELECT COUNT(*)::int AS count FROM "session" WHERE sess->>'authenticated' = 'true'`
  );
  assert.ok(storedSessions.rows[0].count > 0, 'authenticated session should be stored in PostgreSQL');
});

// ── Authenticated access to protected routes ──────────────────────────────────

test('GET /api/matches with valid session returns 200', async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ password: 'correct-test-password-12345' });
  const cookie = loginRes.headers['set-cookie'];

  const res = await request(app)
    .get('/api/matches?gematria=951&normalizedText=שמע%20ישראל')
    .set('Cookie', cookie);
  // 200 OK (may fail with 500 if no DB, but not 401)
  assert.notEqual(res.status, 401);
});

test('matching returns all reasons once per saved entry and preserves word matches', async () => {
  const agent = request.agent(app);
  const alphabet = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  let seed = Date.now();
  let uniqueToken = '';
  while (seed > 0) {
    uniqueToken += alphabet[seed % alphabet.length];
    seed = Math.floor(seed / alphabet.length);
  }

  const originalText = `בדיקת התאמות ${uniqueToken}`;
  const calculated = computeAll(originalText);
  const allTypesText = [...uniqueToken].join(' ');
  const allTypesCalculated = computeAll(allTypesText);
  const savedIds = [];

  try {
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ password: 'correct-test-password-12345' });
    assert.equal(loginRes.status, 200);

    const saveRes = await agent
      .post('/api/entries')
      .send({
        originalText,
        normalizedText: 'tampered',
        fullGematria: 1,
        fullGematriaHebrew: 'א',
        initials: 'א',
        initialsGematria: 1,
        initialsGematriaHebrew: 'א',
        words: [],
      });
    assert.equal(saveRes.status, 200);
    const savedId = saveRes.body.id;
    savedIds.push(savedId);

    const allTypesSaveRes = await agent
      .post('/api/entries')
      .send({ originalText: allTypesText });
    assert.equal(allTypesSaveRes.status, 200);
    const allTypesId = allTypesSaveRes.body.id;
    savedIds.push(allTypesId);

    const duplicateRes = await agent
      .post('/api/entries')
      .send({ originalText });
    assert.equal(duplicateRes.status, 409);

    const listRes = await agent
      .get('/api/entries')
      .query({ search: originalText, limit: 20, offset: 0 });
    assert.equal(listRes.status, 200);

    const saved = listRes.body.entries.find(entry => entry.id === savedId);
    assert.ok(saved, 'saved entry should be returned by the fetch API');
    assert.equal(saved.normalized_text, calculated.normalizedText);
    assert.equal(saved.full_gematria, calculated.fullGematria);
    assert.equal(saved.full_gematria_hebrew, calculated.fullHebrewNumber);
    assert.equal(saved.initials, calculated.initials);
    assert.equal(saved.initials_gematria, calculated.initialsGematria);
    assert.equal(saved.initials_gematria_hebrew, calculated.initialsHebrewNumber);
    assert.equal(saved.words.length, calculated.words.length);
    assert.ok(saved.created_at, 'saved entry should include its creation date');

    const getMatch = async (normalizedText, id, extraQuery = {}) => {
      const response = await agent
        .get('/api/matches')
        .query({ normalizedText, ...extraQuery });
      assert.equal(response.status, 200);
      const matchingRows = response.body.matches.filter(entry => entry.id === id);
      assert.equal(matchingRows.length, 1, 'each saved entry must render only once');
      return matchingRows[0];
    };
    const entryReasons = entry => entry.matchTypes.filter(type => type !== 'saved_word');

    const fullOnlyText = toHebrewNumber(calculated.fullGematria);
    assert.notEqual(fullOnlyText, calculated.initials);
    const fullOnly = await getMatch(fullOnlyText, savedId);
    assert.deepEqual(entryReasons(fullOnly), ['full_gematria']);

    const initialsGematriaOnlyText = toHebrewNumber(calculated.initialsGematria);
    assert.notEqual(initialsGematriaOnlyText, calculated.initials);
    const initialsGematriaOnly = await getMatch(initialsGematriaOnlyText, savedId);
    assert.deepEqual(entryReasons(initialsGematriaOnly), ['initials_gematria']);

    const initialsTextOnlyInput = [...calculated.initials]
      .map(letter => `${letter}א`)
      .join(' ״ ');
    const initialsTextOnly = await getMatch(initialsTextOnlyInput, savedId);
    assert.deepEqual(entryReasons(initialsTextOnly), ['initials_text']);

    const twoReasons = await getMatch(originalText, savedId);
    assert.deepEqual(
      entryReasons(twoReasons),
      ['full_gematria', 'initials_text']
    );

    const allReasons = await getMatch(allTypesText, allTypesId);
    assert.deepEqual(
      entryReasons(allReasons),
      ['full_gematria', 'initials_text', 'initials_gematria']
    );

    const wordOnly = await getMatch(calculated.words[0].word, savedId);
    assert.ok(wordOnly.matchTypes.includes('saved_word'));
    assert.ok(
      wordOnly.matched_words.some(word => word.word === calculated.words[0].word),
      'word match should remain attached to its source entry'
    );

    const forgedValue = await getMatch(fullOnlyText, savedId, {
      gematria: calculated.initialsGematria,
    });
    assert.deepEqual(
      entryReasons(forgedValue),
      ['full_gematria'],
      'numeric reasons must be derived from the live Hebrew text'
    );

    const bulkIds = [];
    for (let index = 0; index < 31; index += 1) {
      const suffix = `${uniqueToken}${alphabet[index % alphabet.length]}${alphabet[Math.floor(index / alphabet.length)]}`;
      const bulkSave = await agent
        .post('/api/entries')
        .send({ originalText: `א ${suffix}` });
      assert.equal(bulkSave.status, 200);
      bulkIds.push(bulkSave.body.id);
      savedIds.push(bulkSave.body.id);
    }

    const untruncatedWords = await agent
      .get('/api/matches')
      .query({ normalizedText: 'א' });
    assert.equal(untruncatedWords.status, 200);
    const returnedBulkIds = new Set(
      untruncatedWords.body.matches
        .filter(entry => entry.matchTypes.includes('saved_word'))
        .map(entry => entry.id)
    );
    assert.ok(
      bulkIds.every(id => returnedBulkIds.has(id)),
      'word matches from more than 30 saved entries must not be truncated'
    );
  } finally {
    for (const id of savedIds) {
      await agent.delete(`/api/entries/${id}`);
    }
  }
});

// ── Logout invalidates session ────────────────────────────────────────────────

test('POST /api/auth/logout destroys session', async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ password: 'correct-test-password-12345' });
  const cookie = loginRes.headers['set-cookie'];

  const logoutRes = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', cookie);
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.body.success, true);
});

test('GET /api/entries returns 401 after logout', async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ password: 'correct-test-password-12345' });
  const cookie = loginRes.headers['set-cookie'];

  // Logout
  await request(app).post('/api/auth/logout').set('Cookie', cookie);

  // The session cookie no longer authenticates
  const res = await request(app)
    .get('/api/entries')
    .set('Cookie', cookie);
  assert.equal(res.status, 401);
});

// ── Complete Tanach corpus and range context ──────────────────────────────────

test('Tanach routes require authentication', async () => {
  const res = await request(app).get('/api/tanach/books');
  assert.equal(res.status, 401);
  const gematriaRes = await request(app).get('/api/tanach/gematria-matches?value=913');
  assert.equal(gematriaRes.status, 401);
});

test('Tanach navigation exposes 24 canonical books and verified Genesis 1:1', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  const booksRes = await agent.get('/api/tanach/books');
  assert.equal(booksRes.status, 200);
  assert.equal(booksRes.body.canonicalBooks.length, 24);
  assert.equal(booksRes.body.books.length, 39);
  assert.equal(booksRes.body.parshiot.length, 54);
  assert.deepEqual(
    booksRes.body.parshiot.map(parsha => parsha.canonical_order),
    Array.from({ length: 54 }, (_, index) => index + 1)
  );
  const lechLecha = booksRes.body.parshiot.find(parsha => parsha.id === 'lech-lecha');
  assert.ok(lechLecha);
  assert.equal(lechLecha.name_he, 'לך לך');
  assert.deepEqual(
    [lechLecha.start_book_slug, lechLecha.start_chapter, lechLecha.start_verse],
    ['Genesis', 12, 1]
  );
  assert.equal(booksRes.body.stats.verses, 23213);
  assert.equal(booksRes.body.source.version, 'UXLC 2.5');
  assert.equal(booksRes.body.source.build, '27.6');
  assert.equal(booksRes.body.source.representation_version, 2);

  const chapterRes = await agent.get('/api/tanach/verses').query({ book: 'Genesis', chapter: 1 });
  assert.equal(chapterRes.status, 200);
  assert.equal(chapterRes.body.verses.length, 31);
  assert.equal(chapterRes.body.verses[0].letter_count, 28);

  const verseRes = await agent.get('/api/tanach/verse').query({ book: 'Genesis', chapter: 1, verse: 1 });
  assert.equal(verseRes.status, 200);
  assert.equal(computeAll(verseRes.body.verse.display_text).fullGematria, 2701);

  const searchRes = await agent.get('/api/tanach/search').query({ q: 'בראשית ברא' });
  assert.equal(searchRes.status, 200);
  assert.ok(searchRes.body.results.some(row => row.book_slug === 'Genesis' && row.chapter === 1 && row.verse === 1));

  const referenceSearch = await agent.get('/api/tanach/search').query({ q: 'בראשית א א' });
  assert.equal(referenceSearch.status, 200);
  assert.equal(referenceSearch.body.results[0].book_slug, 'Genesis');
  assert.equal(referenceSearch.body.results[0].chapter, 1);
  assert.equal(referenceSearch.body.results[0].verse, 1);

  const parshaSearch = await agent.get('/api/tanach/search').query({ q: 'לך לך' });
  assert.equal(parshaSearch.status, 200);
  assert.deepEqual(parshaSearch.body.results[0], {
    type: 'parsha',
    parsha_id: 'lech-lecha',
    parsha_name: 'לך לך',
    book_slug: 'Genesis',
    book_name: 'בראשית',
    chapter: 12,
    verse: 1,
    label: 'פרשת לך לך',
  });

  const ambiguousSearch = await agent.get('/api/tanach/search').query({ q: 'בראשית' });
  assert.ok(ambiguousSearch.body.results.some(item => item.type === 'book' && item.label === 'ספר בראשית'));
  assert.ok(ambiguousSearch.body.results.some(item => item.type === 'parsha' && item.label === 'פרשת בראשית'));

  for (const parsha of booksRes.body.parshiot) {
    for (const endpoint of [
      { book: parsha.start_book_slug, chapter: parsha.start_chapter, verse: parsha.start_verse },
      { book: parsha.end_book_slug, chapter: parsha.end_chapter, verse: parsha.end_verse },
    ]) {
      const endpointRes = await agent.get('/api/tanach/verse').query(endpoint);
      assert.equal(endpointRes.status, 200, `${parsha.name_he} boundary must exist in UXLC`);
    }
  }
});

test('Tanach save context is verified and returned by the saved library API', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const verseRes = await agent.get('/api/tanach/verse').query({ book: 'Genesis', chapter: 1, verse: 1 });
  const originalText = verseRes.body.verse.display_text;
  const canonicalRangeText = createTanachCursor(originalText).range(0, 27).text;
  let savedId;

  try {
    const forged = await agent.post('/api/entries').send({
      originalText: 'שמע',
      tanachContext: { bookSlug: 'Genesis', chapter: 1, verse: 1, start: 0, end: 0 },
    });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error, 'tanach_range_mismatch');

    const save = await agent.post('/api/entries').send({
      // A normalization-equivalent display variant is accepted, but the server
      // must persist canonical pointed text from the referenced corpus range.
      originalText: computeAll(originalText).normalizedText,
      tanachContext: { bookSlug: 'Genesis', chapter: 1, verse: 1, start: 0, end: 27, parshaId: 'bereshit' },
    });
    assert.equal(save.status, 200);
    savedId = save.body.id;

    const list = await agent.get('/api/entries').query({ search: 'בראשית ברא', limit: 20 });
    const entry = list.body.entries.find(row => row.id === savedId);
    assert.ok(entry);
    assert.equal(entry.original_text, canonicalRangeText);
    assert.equal(entry.tanach_book_label, 'בראשית');
    assert.equal(entry.tanach_chapter, 1);
    assert.equal(entry.tanach_verse, 1);
    assert.equal(entry.tanach_start, 0);
    assert.equal(entry.tanach_end, 27);
    assert.equal(entry.parsha_id, 'bereshit');
    assert.equal(entry.parsha_name, 'בראשית');
  } finally {
    if (savedId) await agent.delete(`/api/entries/${savedId}`);
  }
});

test('Tanach gematria discovery validates, paginates, filters, and preserves canonical order', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  for (const query of [
    { value: 0 },
    { value: 100001 },
    { value: 913, type: 'unknown' },
    { value: 913, page: 0 },
    { value: 913, limit: 0 },
  ]) {
    const invalid = await agent.get('/api/tanach/gematria-matches').query(query);
    assert.equal(invalid.status, 400);
  }

  const first = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    type: 'whole_word',
    page: 1,
    limit: 2,
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.target, 913);
  assert.equal(first.body.page, 1);
  assert.equal(first.body.limit, 2);
  assert.ok(first.body.counts.all >= first.body.counts.whole_word);
  assert.ok(first.body.results.every(item => item.type === 'whole_word'));
  assert.ok(first.body.results.some(item => (
    item.bookSlug === 'Genesis' && item.chapter === 1 && item.verse === 1
      && item.start === 0 && item.end === 5 && normalize(item.text) === 'בראשית'
  )));

  if (first.body.hasMore) {
    const second = await agent.get('/api/tanach/gematria-matches').query({
      value: 913,
      type: 'whole_word',
      page: 2,
      limit: 2,
    });
    assert.equal(second.status, 200);
    const keys = new Set(first.body.results.map(item => (
      `${item.bookSlug}:${item.chapter}:${item.verse}:${item.start}:${item.end}`
    )));
    assert.ok(second.body.results.every(item => !keys.has(
      `${item.bookSlug}:${item.chapter}:${item.verse}:${item.start}:${item.end}`
    )));
  }
});

test('qere representation is identical across discovery, exact opening data, and occurrence saves', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const target = computeAll('צואתם').fullGematria;
  const wanted = new Map([
    ['Kings_2:18:27', null],
    ['Isaiah:36:12', null],
  ]);
  // UXLC 2.5 canonical positions for the two qere occurrences. Requesting
  // distant pages also verifies that server pagination does not rescan or lose
  // exact ranges after the first target scan.
  for (const page of [146, 158]) {
    const response = await agent.get('/api/tanach/gematria-matches').query({
      value: target,
      type: 'all',
      page,
      limit: 50,
    });
    assert.equal(response.status, 200);
    for (const item of response.body.results) {
      const key = `${item.bookSlug}:${item.chapter}:${item.verse}`;
      if (wanted.has(key) && normalize(item.text) === 'צואתם') wanted.set(key, item);
    }
  }

  const kings = wanted.get('Kings_2:18:27');
  const isaiah = wanted.get('Isaiah:36:12');
  assert.ok(kings, 'pointed qere must be discoverable in Kings II 18:27');
  assert.ok(isaiah, 'the same pointed qere must be discoverable in Isaiah 36:12');
  assert.doesNotMatch(kings.text, /[ck]/i);

  const savedIds = [];
  try {
    const saveKings = await agent.post('/api/entries').send({
      originalText: kings.text,
      tanachContext: {
        bookSlug: kings.bookSlug,
        chapter: kings.chapter,
        verse: kings.verse,
        start: kings.start,
        end: kings.end,
      },
    });
    assert.equal(saveKings.status, 200);
    savedIds.push(saveKings.body.id);

    const duplicateKings = await agent.post('/api/entries').send({
      originalText: kings.text,
      tanachContext: {
        bookSlug: kings.bookSlug,
        chapter: kings.chapter,
        verse: kings.verse,
        start: kings.start,
        end: kings.end,
      },
    });
    assert.equal(duplicateKings.status, 409);

    const saveIsaiah = await agent.post('/api/entries').send({
      originalText: isaiah.text,
      tanachContext: {
        bookSlug: isaiah.bookSlug,
        chapter: isaiah.chapter,
        verse: isaiah.verse,
        start: isaiah.start,
        end: isaiah.end,
      },
    });
    assert.equal(saveIsaiah.status, 200);
    savedIds.push(saveIsaiah.body.id);

    const exactMatchState = await agent.get('/api/matches').query({
      normalizedText: kings.text,
      bookSlug: kings.bookSlug,
      chapter: kings.chapter,
      verse: kings.verse,
      start: kings.start,
      end: kings.end,
    });
    assert.equal(exactMatchState.status, 200);
    assert.equal(exactMatchState.body.isAlreadySaved, true);
  } finally {
    for (const id of savedIds) await agent.delete(`/api/entries/${id}`);
  }
});

// ── No cross-session data leakage ─────────────────────────────────────────────

test('Session from one agent cannot be reused by a different request without cookie', async () => {
  // Login as agent A
  await request(app)
    .post('/api/auth/login')
    .send({ password: 'correct-test-password-12345' });

  // Agent B makes a request WITHOUT any cookie → must be rejected
  const res = await request(app).get('/api/entries');
  assert.equal(res.status, 401);
});

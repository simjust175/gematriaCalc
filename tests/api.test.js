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
import {
  MILUI_DEFAULT_MAPPING,
  calculateMilui,
  calculateMiluiVariant,
  cloneMiluiMapping,
  getCommonMiluiForms,
  getMiluiVariantOccurrences,
} from '../src/utils/milui.js';

// Set required env vars before importing the app
process.env.SESSION_SECRET  = 'test-session-secret-for-api-tests';
process.env.APP_PASSWORD    = 'correct-test-password-12345';

// Import app AFTER env vars are set
const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');
const {
  ensureActiveMiluiCoverage,
  getMiluiIndexReport,
  invalidateMiluiCoverageCheck,
  rebuildAndActivateMiluiMapping,
} = await import('../server/miluiIndex.js');

function uniqueHebrewToken() {
  const alphabet = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  let seed = Date.now() + Math.floor(Math.random() * 100_000);
  let token = '';
  while (seed > 0) {
    token += alphabet[seed % alphabet.length];
    seed = Math.floor(seed / alphabet.length);
  }
  return token;
}

function sameLettersDifferentOrder(text) {
  return [...normalize(text)].reverse().join('');
}

function findTextWithFullMilui(target, mapping) {
  const candidates = Object.keys(mapping).map(letter => ({
    letter,
    value: calculateMilui(letter, mapping).fullGematria,
  }));
  const solutions = Array(target + 1).fill(null);
  solutions[0] = '';
  for (let total = 1; total <= target; total += 1) {
    for (const candidate of candidates) {
      const remainder = total - candidate.value;
      if (remainder >= 0 && solutions[remainder] !== null) {
        solutions[total] = `${solutions[remainder]}${candidate.letter}`;
        break;
      }
    }
  }
  return solutions[target];
}

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

test('GET /api/multiples requires authentication (401)', async () => {
  const res = await request(app).get('/api/multiples?value=951');
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

test('מילוי settings require authentication', async () => {
  const getRes = await request(app).get('/api/settings/milui');
  const putRes = await request(app).put('/api/settings/milui').send({ mapping: MILUI_DEFAULT_MAPPING });
  assert.equal(getRes.status, 401);
  assert.equal(putRes.status, 401);
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

test('saved library search, summaries, and sorting compose without changing saved data', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const before = await pool.query(
    `SELECT id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
            initials, initials_gematria, initials_gematria_hebrew, created_at,
            tanach_book_slug, tanach_book_label, tanach_chapter, tanach_verse,
            tanach_start, tanach_end, parsha_id
     FROM saved_entries ORDER BY id`
  );
  const token = uniqueHebrewToken();
  const texts = [`${token} אב`, `${token} ג`, `${token} ד`];
  const calculations = texts.map(computeAll);
  const savedIds = [];

  try {
    for (const originalText of texts) {
      const saved = await agent.post('/api/entries').send({ originalText });
      assert.equal(saved.status, 200);
      savedIds.push(saved.body.id);
    }

    const filtered = await agent.get('/api/entries').query({
      search: token,
      sort: 'oldest',
      limit: 100,
    });
    assert.equal(filtered.status, 200);
    const filteredIds = filtered.body.entries
      .filter(entry => savedIds.includes(entry.id))
      .map(entry => entry.id);
    assert.deepEqual(filteredIds, savedIds);
    assert.equal(filtered.body.total, 3);
    assert.deepEqual(filtered.body.stats, {
      saved: 3,
      distinctValues: 2,
      sharedValues: 1,
    });

    const initials = await agent.get('/api/entries').query({
      search: calculations[0].initials,
      limit: 100,
    });
    assert.equal(initials.status, 200);
    assert.ok(initials.body.entries.some(entry => entry.id === savedIds[0]));

    const initialsValue = await agent.get('/api/entries').query({
      search: calculations[0].initialsGematria,
      limit: 100,
    });
    assert.equal(initialsValue.status, 200);
    assert.ok(initialsValue.body.entries.some(entry => entry.id === savedIds[0]));

    const gematriaSort = await agent.get('/api/entries').query({
      search: token,
      sort: 'gematria',
      limit: 100,
    });
    assert.equal(gematriaSort.status, 200);
    assert.deepEqual(
      gematriaSort.body.entries.map(entry => entry.full_gematria),
      [...gematriaSort.body.entries.map(entry => entry.full_gematria)].sort((a, b) => a - b)
    );

    const firstGroupPage = await agent.get('/api/entries').query({
      search: token,
      sort: 'gematria',
      grouped: 'true',
      limit: 1,
      offset: 0,
    });
    assert.equal(firstGroupPage.status, 200);
    assert.equal(firstGroupPage.body.entries.length, 2);
    assert.equal(new Set(firstGroupPage.body.entries.map(entry => entry.full_gematria)).size, 1);
    assert.deepEqual(firstGroupPage.body.pagination, {
      unit: 'groups',
      pageCount: 1,
      nextOffset: 1,
      hasMore: true,
    });

    const secondGroupPage = await agent.get('/api/entries').query({
      search: token,
      sort: 'gematria',
      grouped: 'true',
      limit: 1,
      offset: 1,
    });
    assert.equal(secondGroupPage.status, 200);
    assert.equal(secondGroupPage.body.entries.length, 1);
    assert.equal(secondGroupPage.body.pagination.hasMore, false);
  } finally {
    for (const id of savedIds) await agent.delete(`/api/entries/${id}`);
  }

  const after = await pool.query(
    `SELECT id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
            initials, initials_gematria, initials_gematria_hebrew, created_at,
            tanach_book_slug, tanach_book_label, tanach_chapter, tanach_verse,
            tanach_start, tanach_end, parsha_id
     FROM saved_entries ORDER BY id`
  );
  assert.deepEqual(after.rows, before.rows);
});

test('saved multiple discovery validates input and consolidates approved sources by direction', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  for (const value of ['', '0', '-1', '2.5', '9007199254740992']) {
    const invalid = await agent.get('/api/multiples').query({ value });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, 'invalid_multiple_value');
  }
  const largeValid = await agent.get('/api/multiples').query({ value: 100400 });
  assert.equal(largeValid.status, 200);
  assert.equal(largeValid.body.currentValue, 100400);

  const savedIds = [];
  try {
    const smaller = await agent.post('/api/entries').send({ originalText: `${uniqueHebrewToken()} א ב` });
    assert.equal(smaller.status, 200);
    savedIds.push(smaller.body.id);

    const larger = await agent.post('/api/entries').send({ originalText: `${uniqueHebrewToken()} ס` });
    assert.equal(larger.status, 200);
    savedIds.push(larger.body.id);

    // Use direct fixture values only to isolate the endpoint's source arithmetic;
    // cleanup removes these test-only rows immediately afterward.
    await pool.query(
      `UPDATE saved_entries
       SET full_gematria = CASE id WHEN $1 THEN 3 WHEN $2 THEN 60 END,
           initials = CASE id WHEN $1 THEN 'אב' WHEN $2 THEN 'ס' END,
           initials_gematria = CASE id WHEN $1 THEN 3 WHEN $2 THEN 60 END
       WHERE id IN ($1, $2)`,
      savedIds
    );
    await pool.query('DELETE FROM saved_words WHERE entry_id = ANY($1::int[])', [savedIds]);
    await pool.query(
      `INSERT INTO saved_words (entry_id, word, normalized_word, gematria, position)
       VALUES ($1, 'א', 'א', 1, 0), ($1, 'ב', 'ב', 2, 1), ($2, 'ס', 'ס', 60, 0)`,
      savedIds
    );
    await pool.query(
      `UPDATE saved_entry_milui_index idx
       SET full_milui_gematria = CASE idx.saved_entry_id WHEN $1 THEN 7 WHEN $2 THEN 120 END
       FROM milui_index_state state
       WHERE state.id = 'private-default'
         AND idx.mapping_version = state.active_version
         AND idx.saved_entry_id IN ($1, $2)`,
      savedIds
    );

    const response = await agent.get('/api/multiples').query({ value: 6 });
    assert.equal(response.status, 200);
    assert.equal(response.body.currentValue, 6);

    const intoCurrent = response.body.groups.find(group => group.key === 'into_current');
    const currentIntoSaved = response.body.groups.find(group => group.key === 'current_into_saved');
    const smallerEntry = intoCurrent.entries.find(entry => entry.entryId === savedIds[0]);
    const largerEntry = currentIntoSaved.entries.find(entry => entry.entryId === savedIds[1]);

    assert.ok(smallerEntry);
    assert.deepEqual(
      smallerEntry.relationships.map(item => item.sourceType),
      ['full_gematria', 'initials_gematria', 'saved_word']
    );
    assert.equal(smallerEntry.relationships.some(item => item.sourceValue === 1), false);
    assert.ok(largerEntry);
    assert.ok(largerEntry.relationships.some(item => item.sourceType === 'full_gematria'));
    assert.ok(largerEntry.relationships.some(item => item.sourceType === 'saved_word'));
    assert.ok(largerEntry.relationships.some(
      item => item.sourceType === 'milui_gematria' && item.multiplier === 20
    ));
    assert.equal(
      response.body.groups.flatMap(group => group.entries).some(entry => entry.relationships.some(
        item => item.multiplier === 1
      )),
      false
    );
  } finally {
    for (const id of savedIds) await agent.delete(`/api/entries/${id}`);
  }
});

test('מילוי settings persist and never mutate saved gematria records', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  const originalSettings = await agent.get('/api/settings/milui');
  assert.equal(originalSettings.status, 200);

  const savedEntriesBefore = await pool.query(
    `SELECT id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
            initials, initials_gematria, initials_gematria_hebrew, created_at,
            tanach_book_slug, tanach_book_label, tanach_chapter, tanach_verse,
            tanach_start, tanach_end, parsha_id
     FROM saved_entries ORDER BY id`
  );
  const savedWordsBefore = await pool.query(
    `SELECT id, entry_id, word, normalized_word, gematria, position
     FROM saved_words ORDER BY id`
  );

  try {
    const custom = cloneMiluiMapping(MILUI_DEFAULT_MAPPING);
    custom.ו = 'ויו';
    const saveCustom = await agent.put('/api/settings/milui').send({ mapping: custom });
    assert.equal(saveCustom.status, 200);
    assert.equal(saveCustom.body.mapping.ו, 'ויו');

    const reloaded = await agent.get('/api/settings/milui');
    assert.equal(reloaded.status, 200);
    assert.equal(reloaded.body.mapping.ו, 'ויו');

    const malformed = cloneMiluiMapping(custom);
    malformed.א = 'לף';
    const rejected = await agent.put('/api/settings/milui').send({ mapping: malformed });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, 'invalid_milui_mapping');

    const extraFinalLetter = cloneMiluiMapping(custom);
    extraFinalLetter.ך = 'כף';
    const rejectedFinalLetter = await agent.put('/api/settings/milui').send({ mapping: extraFinalLetter });
    assert.equal(rejectedFinalLetter.status, 400);
    assert.equal(rejectedFinalLetter.body.error, 'invalid_milui_mapping');

    const reset = await agent.put('/api/settings/milui').send({ mapping: MILUI_DEFAULT_MAPPING });
    assert.equal(reset.status, 200);
    assert.deepEqual(reset.body.mapping, MILUI_DEFAULT_MAPPING);

    const savedEntriesAfter = await pool.query(
      `SELECT id, original_text, normalized_text, full_gematria, full_gematria_hebrew,
              initials, initials_gematria, initials_gematria_hebrew, created_at,
              tanach_book_slug, tanach_book_label, tanach_chapter, tanach_verse,
              tanach_start, tanach_end, parsha_id
       FROM saved_entries ORDER BY id`
    );
    const savedWordsAfter = await pool.query(
      `SELECT id, entry_id, word, normalized_word, gematria, position
       FROM saved_words ORDER BY id`
    );
    assert.equal(savedEntriesAfter.rowCount, savedEntriesBefore.rowCount);
    assert.equal(savedWordsAfter.rowCount, savedWordsBefore.rowCount);
    assert.deepEqual(savedEntriesAfter.rows, savedEntriesBefore.rows);
    assert.deepEqual(savedWordsAfter.rows, savedWordsBefore.rows);
  } finally {
    await agent.put('/api/settings/milui').send({ mapping: originalSettings.body.mapping });
  }
});

test('explicit מילוי interpretations persist exact occurrences, deduplicate, and merge into matching', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const settings = await agent.get('/api/settings/milui');
  assert.equal(settings.status, 200);

  const uniqueSuffix = uniqueHebrewToken().replace(/[הו]/g, 'ז');
  const originalText = `ההו ${uniqueSuffix}`;
  const occurrences = getMiluiVariantOccurrences(originalText, settings.body.mapping);
  assert.equal(occurrences.length, 3);
  const selections = occurrences.map((occurrence, index) => ({
    sourceIndex: occurrence.sourceIndex,
    wordIndex: occurrence.wordIndex,
    letterIndex: occurrence.letterIndex,
    letter: occurrence.letter,
    selectedSpelling: ['הי', 'הה', 'וו'][index],
  }));
  const calculation = calculateMiluiVariant(originalText, settings.body.mapping, selections);
  const interpretationIds = [];
  let savedEntryId;

  try {
    const created = await agent.post('/api/milui-interpretations').send({
      originalText,
      selections,
      expectedTotal: calculation.fullGematria,
    });
    assert.equal(created.status, 201);
    interpretationIds.push(created.body.id);
    assert.equal(created.body.normalized_text, calculation.normalizedText);
    assert.equal(created.body.full_milui_gematria, calculation.fullGematria);
    assert.equal(created.body.expanded_text, calculation.expandedText);
    assert.deepEqual(
      created.body.selections.map(item => [item.sourceIndex, item.selectedSpelling]),
      calculation.selections.map(item => [item.sourceIndex, item.selectedSpelling])
    );

    const duplicate = await agent.post('/api/milui-interpretations').send({
      originalText,
      selections,
      expectedTotal: calculation.fullGematria,
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, 'interpretation_already_exists');
    assert.equal(duplicate.body.interpretation.id, created.body.id);

    const changedSelections = selections.map((selection, index) => (
      index === 0 ? { ...selection, selectedSpelling: 'הא' } : selection
    ));
    const changedCalculation = calculateMiluiVariant(
      originalText,
      settings.body.mapping,
      changedSelections
    );
    const changed = await agent.post('/api/milui-interpretations').send({
      originalText,
      selections: changedSelections,
      expectedTotal: changedCalculation.fullGematria,
    });
    assert.equal(changed.status, 201);
    interpretationIds.push(changed.body.id);
    assert.notEqual(changed.body.id, created.body.id);

    const listed = await agent.get('/api/milui-interpretations').query({
      normalizedText: calculation.normalizedText,
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.interpretations.length, 2);
    assert.ok(listed.body.interpretations.every(item => item.mapping_snapshot));

    const unlinkedMatch = await agent.get('/api/matches').query({
      normalizedText: originalText,
      explicitMiluiTotal: calculation.fullGematria,
    });
    assert.equal(unlinkedMatch.status, 200);
    const explicitCard = unlinkedMatch.body.matches.find(
      item => item.original_text === originalText
        && item.explicit_milui_interpretation_ids?.includes(created.body.id)
    );
    assert.ok(explicitCard?.matchTypes.includes('milui_gematria'));

    const interpretationCountBeforeNormalSave = await pool.query(
      'SELECT COUNT(*)::int AS count FROM explicit_milui_interpretations WHERE normalized_text = $1',
      [calculation.normalizedText]
    );
    const normalSave = await agent.post('/api/entries').send({ originalText });
    assert.equal(normalSave.status, 200);
    savedEntryId = normalSave.body.id;
    const interpretationCountAfterNormalSave = await pool.query(
      'SELECT COUNT(*)::int AS count FROM explicit_milui_interpretations WHERE normalized_text = $1',
      [calculation.normalizedText]
    );
    assert.equal(
      interpretationCountAfterNormalSave.rows[0].count,
      interpretationCountBeforeNormalSave.rows[0].count
    );

    const merged = await agent.get('/api/matches').query({
      normalizedText: originalText,
      explicitMiluiTotal: calculation.fullGematria,
    });
    assert.equal(merged.status, 200);
    const mergedRows = merged.body.matches.filter(item => item.id === savedEntryId);
    assert.equal(mergedRows.length, 1);
    assert.ok(mergedRows[0].matchTypes.includes('full_gematria'));
    assert.ok(mergedRows[0].matchTypes.includes('milui_gematria'));
  } finally {
    if (savedEntryId) await agent.delete(`/api/entries/${savedEntryId}`);
    if (interpretationIds.length) {
      await pool.query(
        'DELETE FROM explicit_milui_interpretations WHERE id = ANY($1::bigint[])',
        [interpretationIds]
      );
    }
  }
});

test('save-all creates one ordinary entry and all distinct common מילוי forms atomically', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const suffix = uniqueHebrewToken().replace(/[הו]/g, 'א');
  const originalText = `יהוה ${suffix}`;
  const normalizedText = normalize(originalText);
  const before = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM saved_entries) AS entries,
       (SELECT COUNT(*)::int FROM saved_words) AS words,
       (SELECT COUNT(*)::int FROM explicit_milui_interpretations) AS interpretations`
  );

  try {
    const saved = await agent.post('/api/milui-interpretations/save-all').send({ originalText });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.savedEntry.created, true);
    assert.equal(saved.body.created, 4);
    assert.equal(saved.body.existing, 0);
    assert.equal(saved.body.interpretations.length, 4);
    assert.deepEqual(saved.body.formIds, ['primary', 'av', 'sag', 'ban']);
    const provenance = await pool.query(
      `SELECT save_mode, form_ids
       FROM saved_entry_milui_save_modes
       WHERE saved_entry_id = $1`,
      [saved.body.savedEntry.id]
    );
    assert.equal(provenance.rows[0].save_mode, 'all_forms');
    assert.deepEqual(provenance.rows[0].form_ids, ['primary', 'av', 'sag', 'ban']);

    const after = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM saved_entries) AS entries,
         (SELECT COUNT(*)::int FROM saved_words) AS words,
         (SELECT COUNT(*)::int FROM explicit_milui_interpretations) AS interpretations`
    );
    assert.equal(after.rows[0].entries, before.rows[0].entries + 1);
    assert.equal(after.rows[0].words, before.rows[0].words + 2);
    assert.equal(after.rows[0].interpretations, before.rows[0].interpretations + 4);

    const repeated = await agent.post('/api/milui-interpretations/save-all').send({ originalText });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.savedEntry.created, false);
    assert.equal(repeated.body.created, 0);
    assert.equal(repeated.body.existing, 4);

    const unchanged = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM saved_entries) AS entries,
         (SELECT COUNT(*)::int FROM saved_words) AS words,
         (SELECT COUNT(*)::int FROM explicit_milui_interpretations) AS interpretations`
    );
    assert.deepEqual(unchanged.rows[0], after.rows[0]);
  } finally {
    await pool.query(
      'DELETE FROM explicit_milui_interpretations WHERE normalized_text = $1',
      [normalizedText]
    );
    await pool.query(
      `DELETE FROM saved_entry_milui_index
       WHERE saved_entry_id IN (
         SELECT id FROM saved_entries
         WHERE tanach_book_slug IS NULL AND normalized_text = $1
       )`,
      [normalizedText]
    );
    await pool.query(
      'DELETE FROM saved_entries WHERE tanach_book_slug IS NULL AND normalized_text = $1',
      [normalizedText]
    );
  }
});

test('regular save records primary-only מילוי provenance without explicit variants', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const originalText = `יהוה ${uniqueHebrewToken().replace(/[הו]/g, 'א')}`;
  const normalizedText = normalize(originalText);
  let savedEntryId;
  try {
    const saved = await agent.post('/api/entries').send({ originalText });
    assert.equal(saved.status, 200);
    savedEntryId = saved.body.id;
    const provenance = await pool.query(
      `SELECT save_mode, form_ids
       FROM saved_entry_milui_save_modes
       WHERE saved_entry_id = $1`,
      [savedEntryId]
    );
    assert.equal(provenance.rows[0].save_mode, 'primary_only');
    assert.deepEqual(provenance.rows[0].form_ids, ['primary']);
    const explicit = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM explicit_milui_interpretations
       WHERE normalized_text = $1`,
      [normalizedText]
    );
    assert.equal(explicit.rows[0].count, 0);
  } finally {
    if (savedEntryId) await agent.delete(`/api/entries/${savedEntryId}`);
  }
});

test('ordinary save excludes alternatives, then save-all matches every persisted form once after reload', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const settings = await agent.get('/api/settings/milui');
  const suffix = uniqueHebrewToken().replace(/[הו]/g, 'א');
  const originalText = `ה ${suffix}`;
  const normalizedText = normalize(originalText);
  const forms = getCommonMiluiForms(originalText, settings.body.mapping);
  const primary = forms.find(form => form.id === 'primary');
  const av = forms.find(form => form.id === 'av');
  const sag = forms.find(form => form.id === 'sag');
  const ban = forms.find(form => form.id === 'ban');
  assert.equal(av.calculation.fullGematria, sag.calculation.fullGematria);
  assert.notEqual(primary.calculation.fullGematria, av.calculation.fullGematria);
  assert.notEqual(ban.calculation.fullGematria, av.calculation.fullGematria);
  let savedId;

  try {
    const ordinary = await agent.post('/api/entries').send({ originalText });
    assert.equal(ordinary.status, 200);
    savedId = ordinary.body.id;

    const primaryIndex = await pool.query(
      `SELECT full_milui_gematria
       FROM saved_entry_milui_index
       WHERE saved_entry_id = $1`,
      [savedId]
    );
    assert.equal(primaryIndex.rowCount, 1);
    assert.equal(primaryIndex.rows[0].full_milui_gematria, primary.calculation.fullGematria);

    const beforeAlternative = await agent.get('/api/matches').query({
      normalizedText: toHebrewNumber(av.calculation.fullGematria),
    });
    const beforeEntry = beforeAlternative.body.matches.find(entry => entry.id === savedId);
    assert.equal(beforeEntry?.matchTypes.includes('milui_gematria') || false, false);

    const savedAll = await agent.post('/api/milui-interpretations/save-all').send({ originalText });
    assert.equal(savedAll.status, 201);
    assert.equal(savedAll.body.savedEntry.created, false);
    assert.deepEqual(savedAll.body.formIds, ['primary', 'av', 'sag', 'ban']);

    const formIndex = await pool.query(
      `SELECT form_id, full_milui_gematria
       FROM saved_entry_milui_form_index
       WHERE saved_entry_id = $1
       ORDER BY form_id`,
      [savedId]
    );
    assert.equal(formIndex.rowCount, 4);

    const duplicateTotalMatch = await agent.get('/api/matches').query({
      normalizedText: toHebrewNumber(av.calculation.fullGematria),
    });
    const duplicateCards = duplicateTotalMatch.body.matches.filter(entry => entry.id === savedId);
    assert.equal(duplicateCards.length, 1);
    assert.ok(duplicateCards[0].matchTypes.includes('milui_gematria'));
    assert.deepEqual(
      duplicateCards[0].matched_milui_variants.map(variant => variant.source).sort(),
      ['av', 'sag']
    );

    const otherAlternative = await agent.get('/api/matches').query({
      normalizedText: toHebrewNumber(ban.calculation.fullGematria),
    });
    const otherEntry = otherAlternative.body.matches.find(entry => entry.id === savedId);
    assert.ok(otherEntry?.matchTypes.includes('milui_gematria'));
    assert.deepEqual(otherEntry.matched_milui_variants.map(variant => variant.source), ['ban']);

    const freshAgent = request.agent(app);
    await freshAgent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
    const persisted = await freshAgent.get('/api/matches').query({
      normalizedText: toHebrewNumber(av.calculation.fullGematria),
    });
    assert.equal(
      persisted.body.matches.filter(entry => entry.id === savedId).length,
      1
    );
    const savedState = await freshAgent.get('/api/matches').query({ normalizedText });
    assert.equal(savedState.body.isAlreadySaved, true);
    assert.equal(savedState.body.allMiluiFormsSaved, true);
  } finally {
    if (savedId) await agent.delete(`/api/entries/${savedId}`);
    await pool.query(
      'DELETE FROM explicit_milui_interpretations WHERE normalized_text = $1',
      [normalizedText]
    );
  }
});

test('active full מילוי values participate in live matching and repair missing derived rows', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const settings = await agent.get('/api/settings/milui');
  assert.equal(settings.status, 200);

  const originalText = `בדיקת מילוי ${uniqueHebrewToken()}`;
  const expectedMilui = calculateMilui(originalText, settings.body.mapping);
  const save = await agent.post('/api/entries').send({ originalText });
  assert.equal(save.status, 200);
  const savedId = save.body.id;

  try {
    const matchingInput = toHebrewNumber(expectedMilui.fullGematria);
    const match = await agent.get('/api/matches').query({ normalizedText: matchingInput });
    assert.equal(match.status, 200);
    const rows = match.body.matches.filter(entry => entry.id === savedId);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].matchTypes.includes('milui_gematria'));
    assert.equal(rows[0].full_milui_gematria, expectedMilui.fullGematria);

    const active = await getMiluiIndexReport();
    await pool.query(
      `DELETE FROM saved_entry_milui_index
       WHERE saved_entry_id = $1 AND mapping_version = $2`,
      [savedId, active.activeVersion]
    );

    const repaired = await agent.get('/api/matches').query({ normalizedText: matchingInput });
    assert.equal(repaired.status, 200);
    const repairedEntry = repaired.body.matches.find(entry => entry.id === savedId);
    assert.ok(repairedEntry?.matchTypes.includes('milui_gematria'));

    const repairedRows = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM saved_entry_milui_index
       WHERE saved_entry_id = $1 AND mapping_version = $2`,
      [savedId, active.activeVersion]
    );
    assert.equal(repairedRows.rows[0].count, 1);
  } finally {
    const deleted = await agent.delete(`/api/entries/${savedId}`);
    assert.equal(deleted.status, 200);
    const remnants = await pool.query(
      'SELECT COUNT(*)::int AS count FROM saved_entry_milui_index WHERE saved_entry_id = $1',
      [savedId]
    );
    assert.equal(remnants.rows[0].count, 0);
  }
});

test('full מילוי matching returns every saved entry with the same derived value and excludes nonmatches', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const settings = await agent.get('/api/settings/milui');
  const token = uniqueHebrewToken();
  const firstText = `אב ${token}`;
  const secondText = `בא ${token}`;
  const expected = calculateMilui(firstText, settings.body.mapping).fullGematria;
  assert.equal(calculateMilui(secondText, settings.body.mapping).fullGematria, expected);
  const savedIds = [];

  try {
    for (const originalText of [firstText, secondText]) {
      const save = await agent.post('/api/entries').send({ originalText });
      assert.equal(save.status, 200);
      savedIds.push(save.body.id);
    }
    const match = await agent
      .get('/api/matches')
      .query({ normalizedText: toHebrewNumber(expected) });
    assert.equal(match.status, 200);
    const miluiIds = new Set(
      match.body.matches
        .filter(entry => entry.matchTypes.includes('milui_gematria'))
        .map(entry => entry.id)
    );
    assert.ok(savedIds.every(id => miluiIds.has(id)));

    const nonmatch = await agent.get('/api/matches').query({ normalizedText: 'א' });
    assert.equal(nonmatch.status, 200);
    assert.equal(
      nonmatch.body.matches.some(entry => entry.matchTypes.includes('milui_gematria')),
      false
    );
  } finally {
    for (const id of savedIds) await agent.delete(`/api/entries/${id}`);
  }
});

test('mapping cutover is atomic, versioned, and deduplicates מילוי with standard reasons', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const originalSettings = await agent.get('/api/settings/milui');
  const originalMapping = originalSettings.body.mapping;
  const savedIds = [];

  try {
    const originalText = `וו ${uniqueHebrewToken()}`;
    const save = await agent.post('/api/entries').send({ originalText });
    assert.equal(save.status, 200);
    savedIds.push(save.body.id);

    const oldValue = calculateMilui(originalText, originalMapping).fullGematria;
    const oldMatchingInput = toHebrewNumber(oldValue);
    const custom = cloneMiluiMapping(originalMapping);
    custom.ו = custom.ו === 'ויו' ? 'ואו' : 'ויו';
    const newValue = calculateMilui(originalText, custom).fullGematria;
    assert.notEqual(newValue, oldValue);

    const before = await getMiluiIndexReport();
    const oldMatch = await agent.get('/api/matches').query({ normalizedText: oldMatchingInput });
    assert.equal(oldMatch.status, 200);
    const oldEntry = oldMatch.body.matches.find(entry => entry.id === save.body.id);
    assert.ok(oldEntry?.matchTypes.includes('milui_gematria'));
    assert.equal(oldEntry.full_milui_gematria, oldValue);

    const changed = await agent.put('/api/settings/milui').send({ mapping: custom });
    assert.equal(changed.status, 200);
    assert.ok(Number(changed.body.mappingVersion) > Number(before.activeVersion));

    const after = await getMiluiIndexReport();
    assert.equal(after.indexedEntries, after.savedEntries);
    assert.equal(String(after.activeVersion), String(changed.body.mappingVersion));

    const newMatch = await agent
      .get('/api/matches')
      .query({ normalizedText: toHebrewNumber(newValue) });
    assert.equal(newMatch.status, 200);
    const newEntry = newMatch.body.matches.filter(entry => entry.id === save.body.id);
    assert.equal(newEntry.length, 1);
    assert.ok(newEntry[0].matchTypes.includes('milui_gematria'));
    assert.equal(newEntry[0].full_milui_gematria, newValue);
    assert.notEqual(newEntry[0].full_milui_gematria, oldValue);

    const identity = Object.fromEntries(
      Object.keys(MILUI_DEFAULT_MAPPING).map(letter => [letter, letter])
    );
    const identitySaveText = uniqueHebrewToken();
    const identitySave = await agent.post('/api/entries').send({ originalText: identitySaveText });
    assert.equal(identitySave.status, 200);
    savedIds.push(identitySave.body.id);
    const identityUpdate = await agent.put('/api/settings/milui').send({ mapping: identity });
    assert.equal(identityUpdate.status, 200);

    const deduplicated = await agent
      .get('/api/matches')
      .query({ normalizedText: identitySaveText });
    assert.equal(deduplicated.status, 200);
    const deduplicatedRows = deduplicated.body.matches.filter(
      entry => entry.id === identitySave.body.id
    );
    assert.equal(deduplicatedRows.length, 1);
    assert.ok(deduplicatedRows[0].matchTypes.includes('full_gematria'));
    assert.ok(deduplicatedRows[0].matchTypes.includes('saved_word'));
    assert.ok(deduplicatedRows[0].matchTypes.includes('milui_gematria'));
  } finally {
    await agent.put('/api/settings/milui').send({ mapping: originalMapping });
    for (const id of savedIds) await agent.delete(`/api/entries/${id}`);
  }
});

test('a save committed during a pending rebuild is present at activation', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const originalSettings = await agent.get('/api/settings/milui');
  const custom = cloneMiluiMapping(originalSettings.body.mapping);
  custom.ו = custom.ו === 'ויו' ? 'ואו' : 'ויו';
  const originalText = `שמירה בזמן בנייה ${uniqueHebrewToken()}`;
  const oldWindowText = `וו חלון פעיל ${uniqueHebrewToken()}`;
  const oldWindowValue = calculateMilui(
    oldWindowText,
    originalSettings.body.mapping
  ).fullGematria;
  const newEntryValue = calculateMilui(originalText, custom).fullGematria;
  let savedId;
  let oldWindowId;

  try {
    const oldWindowSave = await agent.post('/api/entries').send({ originalText: oldWindowText });
    assert.equal(oldWindowSave.status, 200);
    oldWindowId = oldWindowSave.body.id;

    const activated = await rebuildAndActivateMiluiMapping(custom, {
      afterPendingCreated: async () => {
        const oldWindow = await agent
          .get('/api/matches')
          .query({ normalizedText: toHebrewNumber(oldWindowValue) });
        assert.equal(oldWindow.status, 200);
        assert.ok(
          oldWindow.body.matches.find(entry => entry.id === oldWindowId)
            ?.matchTypes.includes('milui_gematria'),
          'the previous version must remain visible while the next version is pending'
        );
        const stillActive = await agent.get('/api/settings/milui');
        assert.deepEqual(stillActive.body.mapping, originalSettings.body.mapping);
      },
      afterInitialBuild: async () => {
        const save = await agent.post('/api/entries').send({ originalText });
        assert.equal(save.status, 200);
        savedId = save.body.id;
      },
    });
    assert.ok(savedId);
    assert.equal(activated.coverage.missing, 0);

    const report = await getMiluiIndexReport();
    assert.equal(report.indexedEntries, report.savedEntries);
    const match = await agent
      .get('/api/matches')
      .query({ normalizedText: toHebrewNumber(newEntryValue) });
    assert.equal(match.status, 200);
    assert.ok(
      match.body.matches.find(entry => entry.id === savedId)?.matchTypes.includes('milui_gematria')
    );
  } finally {
    await agent.put('/api/settings/milui').send({ mapping: originalSettings.body.mapping });
    if (savedId) await agent.delete(`/api/entries/${savedId}`);
    if (oldWindowId) await agent.delete(`/api/entries/${oldWindowId}`);
  }
});

test('full מילוי matching never crosses into the filling-only calculation', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const settings = await agent.get('/api/settings/milui');
  assert.equal(settings.status, 200);

  const originalText = `הפרדת מצבים ${uniqueHebrewToken()}`;
  const calculation = calculateMilui(originalText, settings.body.mapping);
  const fullModeProbe = findTextWithFullMilui(
    calculation.fillingOnlyGematria,
    settings.body.mapping
  );
  assert.ok(fullModeProbe, 'test fixture should find a full-milui probe for the filling-only total');
  assert.equal(
    calculateMilui(fullModeProbe, settings.body.mapping).fullGematria,
    calculation.fillingOnlyGematria
  );
  assert.notEqual(calculation.fullGematria, calculation.fillingOnlyGematria);

  const save = await agent.post('/api/entries').send({ originalText });
  assert.equal(save.status, 200);
  try {
    const response = await agent.get('/api/matches').query({ normalizedText: fullModeProbe });
    assert.equal(response.status, 200);
    const saved = response.body.matches.find(entry => entry.id === save.body.id);
    assert.equal(saved?.matchTypes.includes('milui_gematria') || false, false);
  } finally {
    await agent.delete(`/api/entries/${save.body.id}`);
  }
});

test('failed derived work leaves the previous active version and canonical save intact', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const settings = await agent.get('/api/settings/milui');
  const before = await getMiluiIndexReport();
  const custom = cloneMiluiMapping(settings.body.mapping);
  custom.ו = custom.ו === 'ויו' ? 'ואו' : 'ויו';

  await assert.rejects(
    rebuildAndActivateMiluiMapping(custom, {
      afterInitialBuild: async () => {
        throw new Error('intentional derived build failure');
      },
    }),
    /intentional derived build failure/
  );
  const afterFailure = await getMiluiIndexReport();
  assert.equal(String(afterFailure.activeVersion), String(before.activeVersion));
  assert.equal(afterFailure.matchingEnabled, true);
  const unchangedSettings = await agent.get('/api/settings/milui');
  assert.deepEqual(unchangedSettings.body.mapping, settings.body.mapping);

  const activeVersion = afterFailure.activeVersion;
  const activeMapping = await pool.query(
    'SELECT mapping FROM milui_mapping_versions WHERE version = $1',
    [activeVersion]
  );
  const originalText = `כשל אינדקס ${uniqueHebrewToken()}`;
  let savedId;
  try {
    await pool.query(
      `UPDATE milui_mapping_versions
       SET mapping = '{"א":""}'::jsonb
       WHERE version = $1`,
      [activeVersion]
    );
    const save = await agent.post('/api/entries').send({ originalText });
    assert.equal(save.status, 200, 'canonical save must succeed even when derived indexing fails');
    savedId = save.body.id;
    const canonical = await pool.query('SELECT original_text FROM saved_entries WHERE id = $1', [savedId]);
    assert.equal(canonical.rows[0].original_text, originalText);
  } finally {
    await pool.query(
      'UPDATE milui_mapping_versions SET mapping = $2::jsonb WHERE version = $1',
      [activeVersion, JSON.stringify(activeMapping.rows[0].mapping)]
    );
    invalidateMiluiCoverageCheck();
    await ensureActiveMiluiCoverage(pool, { force: true });
    if (savedId) {
      const indexed = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM saved_entry_milui_index
         WHERE saved_entry_id = $1 AND mapping_version = $2`,
        [savedId, activeVersion]
      );
      assert.equal(indexed.rows[0].count, 1);
      await agent.delete(`/api/entries/${savedId}`);
    }
  }
});

test('incomplete מילוי coverage suppresses only מילוי while preserving normal matches', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const report = await getMiluiIndexReport();
  const activeMapping = await pool.query(
    'SELECT mapping FROM milui_mapping_versions WHERE version = $1',
    [report.activeVersion]
  );
  const originalText = `כיסוי חסר ${uniqueHebrewToken()}`;
  const save = await agent.post('/api/entries').send({ originalText });
  assert.equal(save.status, 200);
  const savedId = save.body.id;

  try {
    await pool.query(
      'DELETE FROM saved_entry_milui_index WHERE saved_entry_id = $1 AND mapping_version = $2',
      [savedId, report.activeVersion]
    );
    await pool.query(
      `UPDATE milui_mapping_versions
       SET mapping = '{"א":""}'::jsonb
       WHERE version = $1`,
      [report.activeVersion]
    );
    invalidateMiluiCoverageCheck();
    const unavailable = await agent
      .get('/api/matches')
      .query({ normalizedText: originalText });
    assert.equal(unavailable.status, 200);
    const preserved = unavailable.body.matches.find(entry => entry.id === savedId);
    assert.ok(preserved?.matchTypes.includes('full_gematria'));
    assert.equal(preserved.matchTypes.includes('milui_gematria'), false);
  } finally {
    await pool.query(
      'UPDATE milui_mapping_versions SET mapping = $2::jsonb WHERE version = $1',
      [report.activeVersion, JSON.stringify(activeMapping.rows[0].mapping)]
    );
    invalidateMiluiCoverageCheck();
    await ensureActiveMiluiCoverage(pool, { force: true });
    await agent.delete(`/api/entries/${savedId}`);
  }
});

test('matching returns applicable reasons once per saved entry and preserves word matches', async () => {
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
        finals: 'א',
        finalsGematria: 1,
        finalsGematriaHebrew: 'א',
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
    assert.equal(saved.finals, calculated.finals);
    assert.equal(saved.finals_gematria, calculated.finalsGematria);
    assert.equal(saved.finals_gematria_hebrew, calculated.finalsHebrewNumber);
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

    const finalsGematriaOnlyText = toHebrewNumber(calculated.finalsGematria);
    const finalsGematriaOnly = await getMatch(finalsGematriaOnlyText, savedId);
    assert.ok(entryReasons(finalsGematriaOnly).includes('finals_gematria'));

    const finalsTextOnlyInput = [...calculated.finals]
      .map(letter => `א${letter}`)
      .join(' ״ ');
    const finalsTextOnly = await getMatch(finalsTextOnlyInput, savedId);
    assert.ok(entryReasons(finalsTextOnly).includes('finals_text'));

    const twoReasons = await getMatch(originalText, savedId);
    assert.deepEqual(
      entryReasons(twoReasons),
      ['full_gematria', 'initials_text', 'finals_text']
    );

    const allReasons = await getMatch(allTypesText, allTypesId);
    assert.deepEqual(
      entryReasons(allReasons),
      [
        'full_gematria',
        'initials_text',
        'initials_gematria',
        'finals_text',
        'finals_gematria',
      ]
    );

    const finalsTextSearch = await agent.get('/api/entries').query({
      search: calculated.finals,
      limit: 20,
    });
    assert.equal(finalsTextSearch.status, 200);
    assert.ok(finalsTextSearch.body.entries.some(entry => entry.id === savedId));

    const finalsNumericSearch = await agent.get('/api/entries').query({
      search: String(calculated.finalsGematria),
      limit: 100,
    });
    assert.equal(finalsNumericSearch.status, 200);
    assert.ok(finalsNumericSearch.body.entries.some(entry => entry.id === savedId));

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
    const provenance = await pool.query(
      `SELECT save_mode, form_ids
       FROM saved_entry_milui_save_modes
       WHERE saved_entry_id = $1`,
      [savedId]
    );
    assert.equal(provenance.rows[0].save_mode, 'primary_only');
    assert.deepEqual(provenance.rows[0].form_ids, ['primary']);
  } finally {
    if (savedId) await agent.delete(`/api/entries/${savedId}`);
  }
});

test('Tanach save-all preserves canonical range provenance and records every מילוי form', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const verseRes = await agent.get('/api/tanach/verse').query({ book: 'Genesis', chapter: 1, verse: 1 });
  const cursor = createTanachCursor(verseRes.body.verse.display_text);
  const start = 6;
  const end = 13;
  const canonicalText = cursor.range(start, end).text;
  const normalizedText = normalize(canonicalText);
  let savedId;
  let newInterpretationIds = [];

  const beforeInterpretations = await pool.query(
    'SELECT id FROM explicit_milui_interpretations WHERE normalized_text = $1',
    [normalizedText]
  );
  const beforeIds = new Set(beforeInterpretations.rows.map(row => String(row.id)));

  try {
    const forged = await agent.post('/api/milui-interpretations/save-all').send({
      originalText: 'שמע',
      tanachContext: { bookSlug: 'Genesis', chapter: 1, verse: 1, start, end },
    });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error, 'tanach_range_mismatch');

    const savePayload = {
      originalText: computeAll(canonicalText).normalizedText,
      tanachContext: { bookSlug: 'Genesis', chapter: 1, verse: 1, start, end, parshaId: 'bereshit' },
    };
    const concurrentSaves = await Promise.all([
      agent.post('/api/milui-interpretations/save-all').send(savePayload),
      agent.post('/api/milui-interpretations/save-all').send(savePayload),
    ]);
    assert.ok(concurrentSaves.every(response => [200, 201].includes(response.status)));
    assert.equal(concurrentSaves[0].body.savedEntry.id, concurrentSaves[1].body.savedEntry.id);
    const saved = concurrentSaves.find(response => response.body.savedEntry.created)
      || concurrentSaves[0];
    savedId = saved.body.savedEntry.id;
    assert.deepEqual(saved.body.formIds, ['primary', 'av', 'sag', 'ban']);

    const entry = await pool.query(
      `SELECT original_text, tanach_book_slug, tanach_chapter, tanach_verse,
              tanach_start, tanach_end, parsha_id
       FROM saved_entries WHERE id = $1`,
      [savedId]
    );
    assert.equal(entry.rows[0].original_text, canonicalText);
    assert.deepEqual(
      {
        bookSlug: entry.rows[0].tanach_book_slug,
        chapter: entry.rows[0].tanach_chapter,
        verse: entry.rows[0].tanach_verse,
        start: entry.rows[0].tanach_start,
        end: entry.rows[0].tanach_end,
        parshaId: entry.rows[0].parsha_id,
      },
      { bookSlug: 'Genesis', chapter: 1, verse: 1, start, end, parshaId: 'bereshit' }
    );

    const provenance = await pool.query(
      `SELECT save_mode, form_ids
       FROM saved_entry_milui_save_modes WHERE saved_entry_id = $1`,
      [savedId]
    );
    assert.equal(provenance.rows[0].save_mode, 'all_forms');
    assert.deepEqual(provenance.rows[0].form_ids, ['primary', 'av', 'sag', 'ban']);

    const reloadedMatch = await agent.get('/api/matches').query({
      normalizedText: canonicalText,
      bookSlug: 'Genesis',
      chapter: 1,
      verse: 1,
      start,
      end,
    });
    assert.equal(reloadedMatch.status, 200);
    assert.equal(reloadedMatch.body.isAlreadySaved, true);
    assert.equal(reloadedMatch.body.allMiluiFormsSaved, true);

    const afterInterpretations = await pool.query(
      'SELECT id FROM explicit_milui_interpretations WHERE normalized_text = $1',
      [normalizedText]
    );
    newInterpretationIds = afterInterpretations.rows
      .map(row => String(row.id))
      .filter(id => !beforeIds.has(id));
  } finally {
    if (savedId) await agent.delete(`/api/entries/${savedId}`);
    if (newInterpretationIds.length) {
      await pool.query(
        'DELETE FROM explicit_milui_interpretations WHERE id = ANY($1::bigint[])',
        [newInterpretationIds]
      );
    }
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

  const allWholeWordOrPhrase = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    type: 'all',
    page: 1,
    limit: 2,
  });
  assert.equal(allWholeWordOrPhrase.status, 200);
  assert.ok(allWholeWordOrPhrase.body.results.length > 0);
  assert.ok(allWholeWordOrPhrase.body.results.every(item => (
    item.type === 'whole_word' || item.type === 'whole_phrase'
  )));
  assert.equal(
    allWholeWordOrPhrase.body.counts.all,
    allWholeWordOrPhrase.body.counts.whole_word + allWholeWordOrPhrase.body.counts.whole_phrase,
  );
  assert.equal(
    allWholeWordOrPhrase.body.total,
    allWholeWordOrPhrase.body.counts.all,
  );

  const phrase = await agent.get('/api/tanach/gematria-matches').query({
    value: 1116,
    type: 'all',
    limit: 10,
  });
  assert.equal(phrase.status, 200);
  assert.ok(phrase.body.results.some(item => (
    item.type === 'whole_phrase'
      && item.bookSlug === 'Genesis'
      && item.chapter === 1
      && item.verse === 1
      && normalize(item.text) === 'בראשית ברא'
  )));

  const pagedAll = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    type: 'all',
    page: 2,
    limit: 2,
  });
  assert.equal(pagedAll.status, 200);
  assert.ok(pagedAll.body.results.every(item => (
    item.type === 'whole_word' || item.type === 'whole_phrase'
  )));
});

test('Tanach initials/finals discovery uses exact complete-word windows and validates its contract', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  for (const query of [
    { method: 'initials', sequence: '' },
    { method: 'initials', sequence: 'בב', word_count: 2 },
    { method: 'finals', sequence: 'ת!' },
    { method: 'initials', sequence: 'בב', value: 4 },
    { method: 'gematria', value: 4, sequence: 'בב', word_count: 2 },
    { method: 'unknown', sequence: 'בב' },
  ]) {
    const invalid = await agent.get('/api/tanach/gematria-matches').query(query);
    assert.equal(invalid.status, 400);
  }

  const initials = await agent.get('/api/tanach/gematria-matches').query({
    method: 'initials',
    sequence: 'בב',
    chapter_book: 'Genesis',
    chapter: 1,
    verse: 1,
    limit: 10,
  });
  assert.equal(initials.status, 200);
  assert.equal(initials.body.method, 'initials');
  assert.equal(initials.body.total, 1);
  assert.equal(initials.body.counts.all, 1);
  assert.equal(initials.body.counts.whole_phrase, 1);
  assert.deepEqual(
    initials.body.results.map(item => [item.start, item.end, normalize(item.text)]),
    [[0, 8, 'בראשית ברא']]
  );

  const finals = await agent.get('/api/tanach/gematria-matches').query({
    method: 'finals',
    sequence: 'תא',
    chapter_book: 'Genesis',
    chapter: 1,
    verse: 1,
    limit: 10,
  });
  assert.equal(finals.status, 200);
  assert.deepEqual(
    finals.body.results.map(item => [item.start, item.end, normalize(item.text)]),
    [[0, 8, 'בראשית ברא']]
  );

  const firstPage = await agent.get('/api/tanach/gematria-matches').query({
    method: 'initials',
    sequence: 'בב',
    page: 1,
    limit: 1,
  });
  const secondPage = await agent.get('/api/tanach/gematria-matches').query({
    method: 'initials',
    sequence: 'בב',
    page: 2,
    limit: 1,
  });
  assert.equal(firstPage.status, 200);
  assert.equal(secondPage.status, 200);
  assert.equal(firstPage.body.results.length, 1);
  assert.equal(secondPage.body.results.length, 1);
  assert.ok(firstPage.body.total > 1);
  assert.equal(secondPage.body.total, firstPage.body.total);
  assert.equal(firstPage.body.counts.all, firstPage.body.total);
  assert.equal(firstPage.body.counts.whole_phrase, firstPage.body.total);
  assert.equal(firstPage.body.hasMore, true);
  assert.notDeepEqual(
    firstPage.body.results.map(item => [item.bookSlug, item.chapter, item.verse, item.start, item.end]),
    secondPage.body.results.map(item => [item.bookSlug, item.chapter, item.verse, item.start, item.end])
  );

  const oneLetter = await agent.get('/api/tanach/gematria-matches').query({
    method: 'initials',
    sequence: 'ב',
    chapter_book: 'Genesis',
    chapter: 1,
    verse: 1,
    limit: 10,
  });
  assert.equal(oneLetter.status, 200);
  assert.deepEqual(
    oneLetter.body.results.map(item => normalize(item.text)),
    ['בראשית', 'ברא']
  );
});

test('Tanach gematria discovery searches only matching cards by normalized text, reference, and weekly filter', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  const tooLong = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    search: 'א'.repeat(161),
  });
  assert.equal(tooLong.status, 400);
  const invalidParshah = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    parsha: 'bereshit',
  });
  assert.equal(invalidParshah.status, 400);

  const pointedText = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    type: 'whole_word',
    search: 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃',
  });
  assert.equal(pointedText.status, 200);
  assert.ok(pointedText.body.results.length > 0);
  assert.ok(pointedText.body.results.every(item => (
    item.bookSlug === 'Genesis' && item.chapter === 1 && item.verse === 1
  )));

  const maqaf = await agent.get('/api/tanach/gematria-matches').query({
    value: 52,
    type: 'whole_word',
    search: 'בֶּן־אָדָם',
  });
  assert.equal(maqaf.status, 200);
  assert.ok(maqaf.body.results.length > 0, 'maqaf-separated words remain searchable');

  const reference = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    type: 'whole_word',
    search: 'בראשית א:א',
  });
  assert.equal(reference.status, 200);
  assert.ok(reference.body.results.length > 0);
  assert.ok(reference.body.results.every(item => (
    item.bookSlug === 'Genesis' && item.chapter === 1 && item.verse === 1
  )));

  const composed = await agent.get('/api/tanach/gematria-matches').query({
    value: 913,
    type: 'whole_word',
    search: 'בראשית',
    parsha: 'current',
    page: 1,
    limit: 2,
  });
  assert.equal(composed.status, 200);
  assert.equal(composed.body.page, 1);
  assert.equal(composed.body.limit, 2);
  assert.ok(Object.hasOwn(composed.body, 'weeklyParshah'));
  assert.ok(composed.body.results.every(item => item.type === 'whole_word'));
});

test('Tanach gematria discovery scopes current matches by Chumash and canonical parashah ranges', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  const invalidChumash = await agent.get('/api/tanach/gematria-matches').query({
    value: 26,
    chumash: 'Joshua',
  });
  assert.equal(invalidChumash.status, 400);
  const invalidParshah = await agent.get('/api/tanach/gematria-matches').query({
    value: 26,
    parsha_id: 'not-a-parshah',
  });
  assert.equal(invalidParshah.status, 400);
  const mismatchedParshah = await agent.get('/api/tanach/gematria-matches').query({
    value: 26,
    chumash: 'Exodus',
    parsha_id: 'vayetze',
  });
  assert.equal(mismatchedParshah.status, 400);

  const genesis = await agent.get('/api/tanach/gematria-matches').query({
    value: 26,
    type: 'whole_word',
    chumash: 'Genesis',
    limit: 50,
  });
  assert.equal(genesis.status, 200);
  assert.ok(genesis.body.total > 0);
  assert.ok(genesis.body.results.every(item => item.bookSlug === 'Genesis'));

  const exodus = await agent.get('/api/tanach/gematria-matches').query({
    value: 26,
    type: 'whole_word',
    chumash: 'Exodus',
    limit: 50,
  });
  assert.equal(exodus.status, 200);
  assert.ok(exodus.body.total > 0);
  assert.ok(exodus.body.results.every(item => item.bookSlug === 'Exodus'));

  const vayetze = await agent.get('/api/tanach/gematria-matches').query({
    value: 26,
    type: 'whole_word',
    chumash: 'Genesis',
    parsha_id: 'vayetze',
    limit: 50,
  });
  assert.equal(vayetze.status, 200);
  assert.ok(vayetze.body.total > 0);
  assert.ok(vayetze.body.results.every(item => (
    item.bookSlug === 'Genesis'
    && (item.chapter > 28 || (item.chapter === 28 && item.verse >= 10))
    && (item.chapter < 32 || (item.chapter === 32 && item.verse <= 3))
    && item.type === 'whole_word'
  )));

  const allChumashim = await agent.get('/api/tanach/gematria-matches').query({
    value: 26,
    type: 'whole_word',
    chumash: 'all',
    limit: 50,
  });
  assert.equal(allChumashim.status, 200);
  assert.ok(allChumashim.body.total >= genesis.body.total);
});

test('Tanach gematria discovery scopes results by canonical book, chapter, and exact verse', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });

  const books = await agent.get('/api/tanach/books');
  assert.equal(books.status, 200);
  assert.deepEqual(
    [...new Set(books.body.canonicalBooks.map(book => book.section.id))],
    ['torah', 'prophets', 'writings']
  );
  const samuel = books.body.canonicalBooks.find(book => book.order === 8);
  assert.deepEqual(samuel.segments.map(segment => segment.slug), ['Samuel_1', 'Samuel_2']);

  const invalidBook = await agent.get('/api/tanach/gematria-matches').query({ value: 26, book_order: 25 });
  assert.equal(invalidBook.status, 400);
  const invalidChapter = await agent.get('/api/tanach/gematria-matches').query({ value: 26, chapter: 40 });
  assert.equal(invalidChapter.status, 400);
  const invalidVerse = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, book_order: 10, chapter_book: 'Isaiah', verse: 3,
  });
  assert.equal(invalidVerse.status, 400);
  const mismatchedSegment = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, book_order: 10, chapter_book: 'Genesis', chapter: 1,
  });
  assert.equal(mismatchedSegment.status, 400);
  const missingChapter = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, book_order: 10, chapter_book: 'Isaiah', chapter: 999,
  });
  assert.equal(missingChapter.status, 400);
  const missingVerse = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, book_order: 10, chapter_book: 'Isaiah', chapter: 40, verse: 999,
  });
  assert.equal(missingVerse.status, 400);

  const splitBookChapter = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, book_order: 8, chapter_book: 'Samuel_2', chapter: 1,
  });
  assert.equal(splitBookChapter.status, 200);

  const isaiah = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, type: 'whole_word', book_order: 10, limit: 50,
  });
  assert.equal(isaiah.status, 200);
  assert.ok(isaiah.body.total > 0);
  assert.ok(isaiah.body.results.every(item => item.bookSlug === 'Isaiah'));

  const chapter = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, type: 'whole_word', book_order: 10, chapter_book: 'Isaiah', chapter: 40, limit: 50,
  });
  assert.equal(chapter.status, 200);
  assert.ok(chapter.body.total > 0);
  assert.ok(chapter.body.results.every(item => item.bookSlug === 'Isaiah' && item.chapter === 40));

  const exactVerse = await agent.get('/api/tanach/gematria-matches').query({
    value: 26, type: 'whole_word', book_order: 10, chapter_book: 'Isaiah', chapter: 40, verse: 3, limit: 50,
  });
  assert.equal(exactVerse.status, 200);
  assert.ok(exactVerse.body.total > 0);
  assert.ok(exactVerse.body.results.every(item => (
    item.bookSlug === 'Isaiah' && item.chapter === 40 && item.verse === 3 && item.type === 'whole_word'
  )));
});

test('qere representation is identical across discovery, exact opening data, and occurrence saves', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: 'correct-test-password-12345' });
  const target = computeAll('צואתם').fullGematria;
  const wanted = new Map([
    ['Kings_2:18:27', null],
    ['Isaiah:36:12', null],
  ]);
  // Maqaf is a canonical word boundary, so both pointed qere occurrences are
  // complete words under the shared tokenizer.
  for (const scope of [
    { chapter_book: 'Kings_2', chapter: 18, verse: 27, type: 'whole_word' },
    { chapter_book: 'Isaiah', chapter: 36, verse: 12, type: 'whole_word' },
  ]) {
    const response = await agent.get('/api/tanach/gematria-matches').query({
      value: target,
      ...scope,
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

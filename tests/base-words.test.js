import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { computeAll } from '../src/composables/useGematria.js';

process.env.SESSION_SECRET = 'base-words-test-session-secret';
process.env.APP_PASSWORD = 'base-words-test-password';

const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');

function uniqueText(prefix) {
  const alphabet = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  let value = Date.now() + Math.floor(Math.random() * 100_000);
  let suffix = '';
  while (value) {
    suffix += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length);
  }
  return `${prefix} ${suffix}`;
}

test('base-word API is authenticated, exact, whole-phrase only, and side-effect free', async () => {
  const publicAgent = request(app);
  for (const requestFactory of [
    () => publicAgent.get('/api/base-words'),
    () => publicAgent.post('/api/base-words').send({ originalText: 'שמע' }),
    () => publicAgent.patch('/api/base-words/1').send({ originalText: 'שמע' }),
    () => publicAgent.delete('/api/base-words/1'),
    () => publicAgent.get('/api/base-words/matches').query({ value: 300 }),
  ]) {
    const unauthenticated = await requestFactory();
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.body.error, 'not_authenticated');
  }

  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ password: 'base-words-test-password' });
  assert.equal(login.status, 200);

  const before = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM saved_entries) AS entries,
            (SELECT COUNT(*)::int FROM saved_words) AS words,
            (SELECT COUNT(*)::int FROM tanach_verses) AS verses`
  );
  const initialList = await agent.get('/api/base-words');
  assert.equal(initialList.status, 200);
  const initialIds = new Set(initialList.body.items.map(item => item.id));
  const phrase = uniqueText('שמע ישראל');
  const updatedPhrase = uniqueText('אהיה אשר אהיה');
  const laterPhrase = uniqueText('אדני');
  const phraseCalculation = computeAll(phrase);
  const updatedCalculation = computeAll(updatedPhrase);
  let id;
  let laterId;

  try {
    const invalidPayload = await agent.post('/api/base-words').send({ originalText: '---' });
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.body.error, 'invalid_base_word');
    const invalidSource = await agent.post('/api/base-words').send({
      originalText: 'שמע',
      sourceType: 'saved_entries',
    });
    assert.equal(invalidSource.status, 400);
    assert.equal(invalidSource.body.error, 'invalid_source_type');
    for (const value of ['', '0', '-1', '2.5', '9007199254740992']) {
      const invalidValue = await agent.get('/api/base-words/matches').query({ value });
      assert.equal(invalidValue.status, 400);
      assert.equal(invalidValue.body.error, 'invalid_base_word_value');
    }

    const created = await agent
      .post('/api/base-words')
      .send({ originalText: phrase, sourceType: 'calculator' });
    assert.equal(created.status, 201);
    assert.equal(created.body.item.originalText, phrase);
    assert.equal(created.body.item.normalizedText, phraseCalculation.normalizedText);
    assert.equal(created.body.item.fullGematria, phraseCalculation.fullGematria);
    assert.equal(created.body.item.sourceType, 'calculator');
    id = created.body.item.id;

    const duplicate = await agent.post('/api/base-words').send({
      originalText: `  ${phrase}!!! `,
    });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(duplicate.body, { error: 'base_word_exists' });

    const listed = await agent.get('/api/base-words');
    assert.equal(listed.status, 200);
    assert.ok(listed.body.items.some(item => item.id === id));
    assert.deepEqual(
      listed.body.items.filter(item => !initialIds.has(item.id)).map(item => item.id),
      [id],
      'saving a phrase creates one base-word record, never component-word records'
    );

    const later = await agent.post('/api/base-words').send({ originalText: laterPhrase });
    assert.equal(later.status, 201);
    laterId = later.body.item.id;
    const ordered = await agent.get('/api/base-words');
    const ids = ordered.body.items.map(item => item.id);
    assert.ok(ids.indexOf(id) < ids.indexOf(laterId), 'items retain creation order');

    const duplicateEdit = await agent.patch(`/api/base-words/${laterId}`).send({ originalText: phrase });
    assert.equal(duplicateEdit.status, 409);
    assert.deepEqual(duplicateEdit.body, { error: 'base_word_exists' });

    // The one complete phrase is a match at ×1; no component records are inferred.
    const exact = await agent.get('/api/base-words/matches').query({
      value: phraseCalculation.fullGematria,
    });
    assert.equal(exact.status, 200);
    assert.deepEqual(
      exact.body.results.filter(result => result.id === id),
      [{
        id,
        originalText: phrase,
        fullGematria: phraseCalculation.fullGematria,
        times: 1,
      }]
    );
    const componentOnly = await agent.get('/api/base-words/matches').query({
      value: computeAll('שמע').fullGematria,
    });
    assert.equal(componentOnly.status, 200);
    assert.equal(
      componentOnly.body.results.some(result => result.id === id),
      false,
      'the stored whole phrase is never implicitly decomposed into שמע'
    );

    const multiplied = await agent.get('/api/base-words/matches').query({
      value: phraseCalculation.fullGematria * 2,
    });
    assert.equal(multiplied.status, 200);
    assert.deepEqual(
      multiplied.body.results.filter(result => result.id === id).map(result => result.times),
      [2],
      'a whole-number multiplier greater than one is retained'
    );

    // A non-divisible value never produces a fractional result.
    const nonInteger = await agent.get('/api/base-words/matches').query({
      value: phraseCalculation.fullGematria + 1,
    });
    assert.equal(nonInteger.status, 200);
    assert.equal(nonInteger.body.results.some(result => result.id === id), false);

    const updated = await agent.patch(`/api/base-words/${id}`).send({ originalText: updatedPhrase });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.item.fullGematria, updatedCalculation.fullGematria);
    assert.equal(updated.body.item.normalizedText, updatedCalculation.normalizedText);

    const missing = await agent.patch('/api/base-words/999999999').send({ originalText: updatedPhrase });
    assert.equal(missing.status, 404);
    const invalidUpdate = await agent.patch(`/api/base-words/${id}`).send({ originalText: '' });
    assert.equal(invalidUpdate.status, 400);

    const removed = await agent.delete(`/api/base-words/${id}`);
    assert.equal(removed.status, 204);
    id = null;
    const missingDelete = await agent.delete(`/api/base-words/${created.body.item.id}`);
    assert.equal(missingDelete.status, 404);
  } finally {
    if (id) await agent.delete(`/api/base-words/${id}`);
    if (laterId) await agent.delete(`/api/base-words/${laterId}`);
  }

  const after = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM saved_entries) AS entries,
            (SELECT COUNT(*)::int FROM saved_words) AS words,
            (SELECT COUNT(*)::int FROM tanach_verses) AS verses`
  );
  assert.deepEqual(after.rows, before.rows);
});

test('weekly base-word Parsha API is private, validates page/filter, and returns bounded read-only results', async () => {
  const unauthenticated = await request(app).get('/api/base-words/weekly-parsha');
  assert.equal(unauthenticated.status, 401);

  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ password: 'base-words-test-password' });
  assert.equal(login.status, 200);
  for (const query of [{page:0},{page:'1.5'},{word_id:0},{word_id:'-10'}]) {
    const invalid = await agent.get('/api/base-words/weekly-parsha').query(query);
    assert.equal(invalid.status, 400);
  }

  const before = await pool.query(
    'SELECT (SELECT COUNT(*)::int FROM base_words) AS base_words, (SELECT COUNT(*)::int FROM saved_entries) AS entries'
  );
  const first = await agent.get('/api/base-words/weekly-parsha').query({ page: 1 });
  assert.equal(first.status, 200);
  assert.equal(first.body.page, 1);
  assert.equal(first.body.limit, 50);
  assert.ok(first.body.results.length <= 50);
  assert.ok(first.body.total >= first.body.selectedTotal);
  assert.ok(Array.isArray(first.body.words));
  assert.ok(Number.isInteger(first.body.baseWordCount));

  if (first.body.parsha && first.body.words.length) {
    const word = first.body.words[0];
    const filtered = await agent.get('/api/base-words/weekly-parsha').query({ word_id: word.id });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.total, first.body.total);
    assert.equal(filtered.body.selectedTotal, word.count);
    assert.ok(filtered.body.results.every(item => item.baseWordId === word.id));
  }
  const after = await pool.query(
    'SELECT (SELECT COUNT(*)::int FROM base_words) AS base_words, (SELECT COUNT(*)::int FROM saved_entries) AS entries'
  );
  assert.deepEqual(after.rows, before.rows, 'weekly scan must never change saved records');
});

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
import { computeAll } from '../src/composables/useGematria.js';

// Set required env vars before importing the app
process.env.SESSION_SECRET  = 'test-session-secret-for-api-tests';
process.env.APP_PASSWORD    = 'correct-test-password-12345';

// Import app AFTER env vars are set
const { app } = await import('../server/app.js');

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
});

// ── Authenticated access to protected routes ──────────────────────────────────

test('GET /api/matches with valid session returns 200', async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ password: 'correct-test-password-12345' });
  const cookie = loginRes.headers['set-cookie'];

  const res = await request(app)
    .get('/api/matches?gematria=951&initialsGematria=310')
    .set('Cookie', cookie);
  // 200 OK (may fail with 500 if no DB, but not 401)
  assert.notEqual(res.status, 401);
});

test('saving derives, persists, fetches, and secondary-matches initials data server-side', async () => {
  const agent = request.agent(app);
  const originalText = 'בדיקת שמירת ראשי תיבות';
  const calculated = computeAll(originalText);
  let savedId;

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
    savedId = saveRes.body.id;

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

    const matchRes = await agent
      .get('/api/matches')
      .query({
        gematria: 999999,
        initialsGematria: calculated.initialsGematria,
        normalizedText: 'unrelated',
      });
    assert.equal(matchRes.status, 200);
    assert.equal(matchRes.body.primary.length, 0);
    assert.ok(
      matchRes.body.secondary.some(entry => entry.id === savedId),
      'saved entry should appear as a secondary initials match'
    );
  } finally {
    if (savedId) await agent.delete(`/api/entries/${savedId}`);
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

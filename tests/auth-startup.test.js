import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { resolveAuthentication } from '../src/composables/useAuthentication.js';
import {
  setApplicationReady,
} from '../server/readiness.js';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'readiness-test-session-secret';
process.env.APP_PASSWORD = process.env.APP_PASSWORD || 'readiness-test-password';

const { app } = await import('../server/app.js');

test('API reports a clear 503 while production initialization is incomplete', async () => {
  setApplicationReady(false);
  try {
    const health = await request(app).get('/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { ready: false });

    const auth = await request(app).get('/api/auth/check');
    assert.equal(auth.status, 503);
    assert.equal(auth.body.error, 'app_initializing');
  } finally {
    setApplicationReady(true);
  }
});

test('initial authentication retries only the short startup state', async () => {
  const statuses = [503, 503, 200];
  const delays = [];
  const state = await resolveAuthentication(
    async () => ({
      status: statuses.shift(),
      ok: statuses.length === 0,
      json: async () => ({ authenticated: true }),
    }),
    async delay => { delays.push(delay); }
  );
  assert.equal(state, 'authenticated');
  assert.deepEqual(delays, [250, 400]);
});

test('initial authentication does not retry a normal unauthenticated response', async () => {
  let calls = 0;
  const state = await resolveAuthentication(
    async () => {
      calls += 1;
      return { status: 200, ok: true, json: async () => ({ authenticated: false }) };
    },
    async () => assert.fail('normal auth checks must not wait')
  );
  assert.equal(state, 'unauthenticated');
  assert.equal(calls, 1);
});
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.APP_PASSWORD = process.env.APP_PASSWORD || 'auth-routing-test-password';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'auth-routing-test-session-secret';
delete process.env.PUBLIC_SIGNUP_ENABLED;

const { app } = await import('../server/combinedApp.js');
const { RoleRoutedSessionStore } = await import('../server/sessionStore.js');

test('legacy password login and session restoration remain available without multi-user database', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({
    password: process.env.APP_PASSWORD,
  });
  assert.equal(login.status, 200);

  const check = await agent.get('/api/auth/check');
  assert.equal(check.status, 200);
  assert.equal(check.body.authenticated, true);
  assert.equal(check.body.account.accountType, 'legacy_client');

  const logout = await agent.post('/api/auth/logout');
  assert.equal(logout.status, 200);
});

test('standard signup and login fail closed when the multi-user pool is absent', async () => {
  const signup = await request(app).post('/api/auth/signup').send({
    email: 'unavailable@example.test',
    password: 'a-valid-password-123',
  });
  assert.equal(signup.status, 404);
  assert.equal(signup.body.error, 'not_found');

  const login = await request(app).post('/api/auth/account-login').send({
    email: 'unavailable@example.test',
    password: 'a-valid-password-123',
  });
  assert.equal(login.status, 503);
  assert.equal(login.body.error, 'multi_user_unavailable');
});

test('a multi-user session cookie fails closed without falling back to legacy', async () => {
  const response = await request(app)
    .get('/api/auth/check')
    .set('Cookie', 'connect.sid=s%3Amulti%3Afake-session.signature');
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'multi_user_unavailable');
});

test('role-routed session storage never routes a multi-user session to legacy', () => {
  const legacyPool = {};
  const store = new RoleRoutedSessionStore({ legacyPool, multiUserPool: null });
  assert.equal(store.storeForSessionId('legacy:session'), store.legacyStore);
  assert.throws(
    () => store.storeForSessionId('multi:session'),
    error => error.code === 'MULTI_USER_DATABASE_UNAVAILABLE'
  );
  assert.throws(
    () => store.storeForSession({ databaseRole: 'multi-user' }, 'multi:session'),
    error => error.code === 'MULTI_USER_DATABASE_UNAVAILABLE'
  );
});
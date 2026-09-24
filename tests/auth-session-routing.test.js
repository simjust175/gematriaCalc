import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.APP_PASSWORD = process.env.APP_PASSWORD || 'auth-routing-test-password';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'auth-routing-test-session-secret';
const { app } = await import('../server/app.js');

test('private password login and session restoration remain available', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({
    password: process.env.APP_PASSWORD,
  });
  assert.equal(login.status, 200);

  const check = await agent.get('/api/auth/check');
  assert.equal(check.status, 200);
  assert.equal(check.body.authenticated, true);
  assert.deepEqual(check.body, { authenticated: true });

  const logout = await agent.post('/api/auth/logout');
  assert.equal(logout.status, 200);
});

test('account signup and account login routes do not exist', async () => {
  const signup = await request(app).post('/api/auth/signup').send({
    email: 'unavailable@example.test',
    password: 'a-valid-password-123',
  });
  assert.equal(signup.status, 404);

  const login = await request(app).post('/api/auth/account-login').send({
    email: 'unavailable@example.test',
    password: 'a-valid-password-123',
  });
  assert.equal(login.status, 404);
});
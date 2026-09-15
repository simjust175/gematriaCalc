import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

delete process.env.PUBLIC_SIGNUP_ENABLED;
process.env.SESSION_SECRET = 'multi-user-test-session-secret';
process.env.APP_PASSWORD = 'multi-user-test-app-password';

const { app } = await import('../server/app.js');
const { legacyPool, multiUserPool } = await import('../server/databaseRouter.js');
const {
  LEGACY_ACCOUNT_KEY,
  SIGNUP_ENABLED,
  createStandardAccount,
  ensureMultiUserFoundation,
  getLegacyAccount,
} = await import('../server/accounts.js');

function sessionIdFromResponse(response) {
  const cookie = response.headers['set-cookie']?.find(value => value.startsWith('connect.sid='));
  assert.ok(cookie, 'standard login must issue a session cookie');
  return decodeURIComponent(cookie.split(';', 1)[0].slice('connect.sid='.length))
    .replace(/^s:/, '')
    .split('.')[0];
}

test(
  'standard accounts and sessions use the dedicated multi-user database',
  { concurrency: false, skip: !multiUserPool ? 'MULTI_USER_DATABASE_URL is not provisioned' : false },
  async () => {
    assert.equal(SIGNUP_ENABLED, false);
    assert.equal(multiUserPool.databaseRole, 'multi-user');
    assert.equal(legacyPool.databaseRole, 'legacy');

    await ensureMultiUserFoundation(multiUserPool, { allowSchemaChanges: true });
    const legacy = await getLegacyAccount(legacyPool);
    assert.equal(legacy.accountKey, LEGACY_ACCOUNT_KEY);

    const email = `multi-user-${randomUUID()}@example.test`;
    const password = 'multi-user-test-password-123';
    let standardAccount;
    let sessionId;

    try {
      standardAccount = await createStandardAccount(multiUserPool, { email, password });
      const agent = request.agent(app);
      const login = await agent.post('/api/auth/account-login').send({ email, password });
      assert.equal(login.status, 200);
      assert.equal(login.body.account.id, standardAccount.id);
      assert.equal(login.body.account.accountType, 'standard');
      sessionId = sessionIdFromResponse(login);

      const check = await agent.get('/api/auth/check');
      assert.equal(check.status, 200);
      assert.equal(check.body.authenticated, true);
      assert.equal(check.body.account.id, standardAccount.id);

      const multiAccount = await multiUserPool.query(
        'SELECT id, email, account_type FROM app_accounts WHERE id = $1',
        [standardAccount.id]
      );
      assert.deepEqual(multiAccount.rows, [{
        id: standardAccount.id,
        email: email.toLowerCase(),
        account_type: 'standard',
      }]);

      const legacyAccount = await legacyPool.query(
        'SELECT id FROM app_accounts WHERE email = $1',
        [email.toLowerCase()]
      );
      assert.equal(legacyAccount.rowCount, 0);

      const multiSession = await multiUserPool.query(
        'SELECT sid FROM "session" WHERE sid = $1',
        [sessionId]
      );
      assert.equal(multiSession.rowCount, 1);

      const legacySession = await legacyPool.query(
        'SELECT sid FROM "session" WHERE sid = $1',
        [sessionId]
      );
      assert.equal(legacySession.rowCount, 0);
    } finally {
      if (sessionId) {
        await multiUserPool.query('DELETE FROM "session" WHERE sid = $1', [sessionId]);
      }
      if (standardAccount) {
        await multiUserPool.query('DELETE FROM app_accounts WHERE id = $1', [standardAccount.id]);
      }
    }
  }
);
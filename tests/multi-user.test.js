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
const { computeAll } = await import('../src/composables/useGematria.js');

function sessionIdFromResponse(response) {
  const cookie = response.headers['set-cookie']?.find(value => value.startsWith('connect.sid='));
  assert.ok(cookie, 'standard login must issue a session cookie');
  return decodeURIComponent(cookie.split(';', 1)[0].slice('connect.sid='.length))
    .replace(/^s:/, '')
    .split('.')[0];
}

function uniqueHebrew(prefix) {
  const alphabet = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  const suffix = randomUUID().replaceAll('-', '').split('')
    .map(character => alphabet[Number.parseInt(character, 16) % alphabet.length])
    .join('');
  return `${prefix} ${suffix}`;
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
    let legacyEntryId;
    let standardEntryId;
    let legacyAgent;
    let standardAgent;

    try {
      standardAccount = await createStandardAccount(multiUserPool, { email, password });
      standardAgent = request.agent(app);
      const login = await standardAgent.post('/api/auth/account-login').send({ email, password });
      assert.equal(login.status, 200);
      assert.equal(login.body.account.id, standardAccount.id);
      assert.equal(login.body.account.accountType, 'standard');
      sessionId = sessionIdFromResponse(login);

      const check = await standardAgent.get('/api/auth/check');
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

      legacyAgent = request.agent(app);
      const legacyLogin = await legacyAgent.post('/api/auth/login').send({
        password: process.env.APP_PASSWORD,
      });
      assert.equal(legacyLogin.status, 200);

      const sharedText = uniqueHebrew('בדיקת הפרדה');
      const legacySave = await legacyAgent.post('/api/entries').send({ originalText: sharedText });
      const standardSave = await standardAgent.post('/api/entries').send({ originalText: sharedText });
      assert.equal(legacySave.status, 200);
      assert.equal(standardSave.status, 200);
      legacyEntryId = legacySave.body.id;
      standardEntryId = standardSave.body.id;

      const legacyList = await legacyAgent.get('/api/entries').query({ search: sharedText });
      const standardList = await standardAgent.get('/api/entries').query({ search: sharedText });
      assert.deepEqual(legacyList.body.entries.map(entry => entry.id), [legacyEntryId]);
      assert.deepEqual(standardList.body.entries.map(entry => entry.id), [standardEntryId]);

      const calculated = computeAll(sharedText);
      const legacyRows = await legacyPool.query(
        'SELECT id, owner_id FROM saved_entries WHERE normalized_text = $1',
        [calculated.normalizedText]
      );
      const multiRows = await multiUserPool.query(
        'SELECT id, owner_id FROM saved_entries WHERE normalized_text = $1',
        [calculated.normalizedText]
      );
      assert.deepEqual(legacyRows.rows.map(row => row.id), [legacyEntryId]);
      assert.deepEqual(multiRows.rows.map(row => row.id), [standardEntryId]);

      assert.equal(
        (await legacyAgent.delete(`/api/entries/${standardEntryId}`)).status,
        legacyEntryId === standardEntryId ? 200 : 404
      );
      if (legacyEntryId === standardEntryId) legacyEntryId = null;
      assert.equal(
        (await standardAgent.delete(`/api/entries/${legacyEntryId || legacySave.body.id}`)).status,
        standardEntryId === legacySave.body.id ? 200 : 404
      );
      if (standardEntryId === legacySave.body.id) standardEntryId = null;
    } finally {
      if (legacyEntryId && legacyAgent) {
        await legacyAgent.delete(`/api/entries/${legacyEntryId}`);
      }
      if (standardEntryId && standardAgent) {
        await standardAgent.delete(`/api/entries/${standardEntryId}`);
      }
      if (sessionId) {
        await multiUserPool.query('DELETE FROM "session" WHERE sid = $1', [sessionId]);
      }
      if (standardAccount) {
        await multiUserPool.query('DELETE FROM app_accounts WHERE id = $1', [standardAccount.id]);
      }
    }
  }
);
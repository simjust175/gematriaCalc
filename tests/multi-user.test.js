import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { cloneMiluiMapping } from '../src/utils/milui.js';

delete process.env.PUBLIC_SIGNUP_ENABLED;
process.env.SESSION_SECRET = 'multi-user-test-session-secret';
process.env.APP_PASSWORD = 'multi-user-test-app-password';

const { app } = await import('../server/app.js');
const { pool } = await import('../server/db.js');
const {
  LEGACY_ACCOUNT_KEY,
  SIGNUP_ENABLED,
  createStandardAccount,
  ensureMultiUserFoundation,
  getLegacyAccount,
} = await import('../server/accounts.js');

const PRIVATE_TABLES = [
  'saved_entries',
  'saved_words',
  'base_words',
  'curated_matches',
  'explicit_milui_interpretations',
  'saved_entry_milui_save_modes',
  'saved_entry_milui_form_index',
  'saved_entry_milui_index',
  'milui_preferences',
  'milui_mapping_versions',
  'milui_index_state',
];

function uniqueHebrew(prefix) {
  const alphabet = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  const suffix = randomUUID().replaceAll('-', '').split('')
    .map(character => alphabet[Number.parseInt(character, 16) % alphabet.length])
    .join('');
  return `${prefix} ${suffix}`;
}

async function tableExists(tableName) {
  const result = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [tableName]);
  return result.rows[0].present;
}

async function capturePrivateRows() {
  const snapshot = {};
  for (const tableName of PRIVATE_TABLES) {
    if (!(await tableExists(tableName))) continue;
    const result = await pool.query(
      `SELECT COUNT(*)::int AS row_count,
              md5(COALESCE(string_agg((to_jsonb(private_row) - 'owner_id')::text, '|'
                ORDER BY (to_jsonb(private_row) - 'owner_id')::text), '')) AS content_fingerprint,
              COALESCE(array_agg(DISTINCT owner_id ORDER BY owner_id), '{}') AS owner_ids
       FROM ${tableName} private_row`
    );
    snapshot[tableName] = result.rows[0];
  }
  return snapshot;
}

function contentSnapshot(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([table, row]) => [
    table,
    { row_count: row.row_count, content_fingerprint: row.content_fingerprint },
  ]));
}

function assertNoBackfills(result) {
  for (const [tableName, count] of Object.entries(result.backfilled)) {
    assert.equal(count, 0, `${tableName} must not be backfilled again`);
  }
}

test('private data and every multi-user API surface are owner-isolated', { concurrency: false }, async () => {
  assert.equal(SIGNUP_ENABLED, false);

  const legacy = await getLegacyAccount(pool);
  const legacyId = Number(legacy.id);
  const hiddenLegacyAccounts = await pool.query(
    `SELECT account.id, account.account_key, account.account_type, account.is_hidden,
            entitlement.plan_code, entitlement.status, entitlement.is_unlimited,
            entitlement.billing_exempt
     FROM app_accounts account
     JOIN account_entitlements entitlement ON entitlement.account_id = account.id
     WHERE account.account_type = 'legacy_client' OR account.account_key = $1`,
    [LEGACY_ACCOUNT_KEY]
  );
  assert.equal(hiddenLegacyAccounts.rowCount, 1);
  assert.deepEqual(
    {
      id: Number(hiddenLegacyAccounts.rows[0].id),
      account_key: hiddenLegacyAccounts.rows[0].account_key,
      account_type: hiddenLegacyAccounts.rows[0].account_type,
      is_hidden: hiddenLegacyAccounts.rows[0].is_hidden,
      plan_code: hiddenLegacyAccounts.rows[0].plan_code,
      status: hiddenLegacyAccounts.rows[0].status,
      is_unlimited: hiddenLegacyAccounts.rows[0].is_unlimited,
      billing_exempt: hiddenLegacyAccounts.rows[0].billing_exempt,
    },
    {
      id: legacyId,
      account_key: LEGACY_ACCOUNT_KEY,
      account_type: 'legacy_client',
      is_hidden: true,
      plan_code: 'legacy_unlimited',
      status: 'active',
      is_unlimited: true,
      billing_exempt: true,
    }
  );

  // Capture and verify the complete private set before adding any test fixture.
  const preexistingLegacySet = await capturePrivateRows();
  for (const [tableName, row] of Object.entries(preexistingLegacySet)) {
    assert.deepEqual(
      row.owner_ids.map(Number),
      row.row_count ? [legacyId] : [],
      `all preexisting ${tableName} rows must belong to the legacy account`
    );
  }

  const existingSessionIds = (await tableExists('session'))
    ? new Set((await pool.query('SELECT sid FROM "session"')).rows.map(row => row.sid))
    : new Set();
  const legacyAgent = request.agent(app);
  const standardAgent = request.agent(app);
  const password = `Valid-${randomUUID()}-password`;
  const email = `multi-${randomUUID()}@example.test`;
  const sharedPhrase = uniqueHebrew('ביטוי משותף');
  const sharedBaseWord = uniqueHebrew('מילת בסיס');
  const curatedParent = uniqueHebrew('הורה מותאם');
  const legacyEntryIds = [];
  const legacyBaseWordIds = [];
  let standardAccount;

  try {
    const signup = await request(app).post('/api/auth/signup').send({ email, password });
    assert.equal(signup.status, 404);
    assert.equal(signup.body.error, 'not_found');

    const legacyLogin = await legacyAgent.post('/api/auth/login')
      .send({ password: process.env.APP_PASSWORD });
    assert.equal(legacyLogin.status, 200);
    const legacyCheck = await legacyAgent.get('/api/auth/check');
    assert.equal(legacyCheck.status, 200);
    assert.equal(legacyCheck.body.authenticated, true);
    assert.equal(legacyCheck.body.account.id, legacyId);
    assert.equal(legacyCheck.body.account.accountType, 'legacy_client');

    standardAccount = await createStandardAccount(pool, { email, password });
    const standardId = Number(standardAccount.id);
    const standardLogin = await standardAgent.post('/api/auth/account-login').send({ email, password });
    assert.equal(standardLogin.status, 200);
    assert.equal(standardLogin.body.account.id, standardId);
    assert.equal(standardLogin.body.account.accountType, 'standard');

    // Repeated checks on the same agents prove that PostgreSQL sessions retain identity.
    for (const [agent, expectedId] of [[legacyAgent, legacyId], [standardAgent, standardId]]) {
      const first = await agent.get('/api/auth/check');
      const second = await agent.get('/api/auth/check');
      assert.equal(first.body.account.id, expectedId);
      assert.equal(second.body.account.id, expectedId);
    }

    const legacySaved = await legacyAgent.post('/api/entries').send({ originalText: sharedPhrase });
    const standardSaved = await standardAgent.post('/api/entries').send({ originalText: sharedPhrase });
    assert.equal(legacySaved.status, 200);
    assert.equal(standardSaved.status, 200);
    assert.notEqual(legacySaved.body.id, standardSaved.body.id);
    legacyEntryIds.push(legacySaved.body.id);
    const standardEntryId = standardSaved.body.id;

    const storedOwners = await pool.query(
      'SELECT id, owner_id FROM saved_entries WHERE id = ANY($1::bigint[]) ORDER BY id',
      [[legacySaved.body.id, standardEntryId]]
    );
    assert.deepEqual(new Set(storedOwners.rows.map(row => Number(row.owner_id))), new Set([legacyId, standardId]));

    const legacyList = await legacyAgent.get('/api/entries').query({ search: sharedPhrase, limit: 100 });
    const standardList = await standardAgent.get('/api/entries').query({ search: sharedPhrase, limit: 100 });
    assert.equal(legacyList.status, 200);
    assert.equal(standardList.status, 200);
    assert.deepEqual(legacyList.body.entries.map(entry => entry.id), [legacySaved.body.id]);
    assert.deepEqual(standardList.body.entries.map(entry => entry.id), [standardEntryId]);

    const guessedStandardDelete = await legacyAgent.delete(`/api/entries/${standardEntryId}`);
    const guessedLegacyDelete = await standardAgent.delete(`/api/entries/${legacySaved.body.id}`);
    assert.equal(guessedStandardDelete.status, 404);
    assert.equal(guessedLegacyDelete.status, 404);
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS count FROM saved_entries WHERE id = ANY($1::bigint[])',
      [[legacySaved.body.id, standardEntryId]]
    )).rows[0].count, 2);

    const legacyBase = await legacyAgent.post('/api/base-words').send({ originalText: sharedBaseWord });
    const standardBase = await standardAgent.post('/api/base-words').send({ originalText: sharedBaseWord });
    assert.equal(legacyBase.status, 201);
    assert.equal(standardBase.status, 201);
    legacyBaseWordIds.push(legacyBase.body.item.id);
    const standardBaseId = standardBase.body.item.id;
    const legacyBaseList = await legacyAgent.get('/api/base-words');
    const standardBaseList = await standardAgent.get('/api/base-words');
    assert.ok(legacyBaseList.body.items.some(item => item.id === legacyBase.body.item.id));
    assert.ok(!legacyBaseList.body.items.some(item => item.id === standardBaseId));
    assert.ok(standardBaseList.body.items.some(item => item.id === standardBaseId));
    assert.ok(!standardBaseList.body.items.some(item => item.id === legacyBase.body.item.id));
    assert.equal((await legacyAgent.patch(`/api/base-words/${standardBaseId}`)
      .send({ originalText: uniqueHebrew('ניחוש עדכון') })).status, 404);
    assert.equal((await standardAgent.delete(`/api/base-words/${legacyBase.body.item.id}`)).status, 404);
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS count FROM base_words WHERE id = ANY($1::bigint[])',
      [[legacyBase.body.item.id, standardBaseId]]
    )).rows[0].count, 2);

    const verse = await legacyAgent.get('/api/tanach/verse')
      .query({ book: 'Genesis', chapter: 1, verse: 1 });
    assert.equal(verse.status, 200);
    const cursor = createTanachCursor(verse.body.verse.display_text);
    const tanachContext = {
      bookSlug: 'Genesis',
      chapter: 1,
      verse: 1,
      start: 0,
      end: cursor.count - 1,
    };
    const curatedPayload = {
      parentOriginalText: curatedParent,
      matches: [{
        originalText: cursor.range(0, cursor.count - 1).text,
        tanachContext,
        reasonCode: 'full_gematria',
      }],
    };
    const legacyCurated = await legacyAgent.post('/api/entries/curated-matches').send(curatedPayload);
    const standardCurated = await standardAgent.post('/api/entries/curated-matches').send(curatedPayload);
    assert.equal(legacyCurated.status, 200);
    assert.equal(standardCurated.status, 200);
    legacyEntryIds.push(legacyCurated.body.parentId);
    const legacyMatchId = legacyCurated.body.matches[0].id;
    const standardMatchId = standardCurated.body.matches[0].id;
    assert.notEqual(legacyCurated.body.parentId, standardCurated.body.parentId);
    assert.equal((await standardAgent.delete(
      `/api/entries/${legacyCurated.body.parentId}/curated-matches/${legacyMatchId}`
    )).status, 404);
    assert.equal((await legacyAgent.delete(
      `/api/entries/${standardCurated.body.parentId}/curated-matches/${standardMatchId}`
    )).status, 404);
    const curatedRows = await pool.query(
      `SELECT id, owner_id, parent_id FROM curated_matches
       WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [[legacyMatchId, standardMatchId]]
    );
    assert.equal(curatedRows.rowCount, 2);
    assert.deepEqual(new Set(curatedRows.rows.map(row => Number(row.owner_id))), new Set([legacyId, standardId]));

    const legacyCuratedList = await legacyAgent.get('/api/entries').query({ search: curatedParent });
    const standardCuratedList = await standardAgent.get('/api/entries').query({ search: curatedParent });
    assert.deepEqual(legacyCuratedList.body.entries[0].curated_matches.map(match => match.id), [legacyMatchId]);
    assert.deepEqual(standardCuratedList.body.entries[0].curated_matches.map(match => match.id), [standardMatchId]);

    const legacySettingsBefore = await legacyAgent.get('/api/settings/milui');
    assert.equal(legacySettingsBefore.status, 200);
    const standardSettings = await standardAgent.get('/api/settings/milui');
    assert.equal(standardSettings.status, 200);
    const customMapping = cloneMiluiMapping(standardSettings.body.mapping);
    customMapping.ו = customMapping.ו === 'ויו' ? 'ואו' : 'ויו';
    const updatedStandardSettings = await standardAgent.put('/api/settings/milui')
      .send({ mapping: customMapping });
    assert.equal(updatedStandardSettings.status, 200);
    assert.deepEqual((await standardAgent.get('/api/settings/milui')).body.mapping, customMapping);
    assert.deepEqual((await legacyAgent.get('/api/settings/milui')).body, legacySettingsBefore.body);

    const legacyMatches = await legacyAgent.get('/api/matches').query({ normalizedText: sharedPhrase });
    const standardMatches = await standardAgent.get('/api/matches').query({ normalizedText: sharedPhrase });
    assert.equal(legacyMatches.status, 200);
    assert.equal(standardMatches.status, 200);
    assert.ok(legacyMatches.body.matches.some(match => match.id === legacySaved.body.id));
    assert.ok(!legacyMatches.body.matches.some(match => match.id === standardEntryId));
    assert.ok(standardMatches.body.matches.some(match => match.id === standardEntryId));
    assert.ok(!standardMatches.body.matches.some(match => match.id === legacySaved.body.id));

    const fixtureIndexRows = await pool.query(
      `SELECT idx.saved_entry_id, idx.owner_id, entry.owner_id AS entry_owner_id
       FROM saved_entry_milui_index idx
       JOIN saved_entries entry ON entry.id = idx.saved_entry_id
       WHERE idx.saved_entry_id = ANY($1::bigint[])`,
      [[legacySaved.body.id, standardEntryId]]
    );
    assert.ok(fixtureIndexRows.rows.some(row => Number(row.saved_entry_id) === Number(legacySaved.body.id)));
    assert.ok(fixtureIndexRows.rows.some(row => Number(row.saved_entry_id) === Number(standardEntryId)));
    for (const row of fixtureIndexRows.rows) {
      assert.equal(Number(row.owner_id), Number(row.entry_owner_id));
    }
    const ownerStates = await pool.query(
      `SELECT state.owner_id, state.active_version, version.owner_id AS version_owner_id
       FROM milui_index_state state
       JOIN milui_mapping_versions version ON version.version = state.active_version
       WHERE state.owner_id = ANY($1::bigint[])`,
      [[legacyId, standardId]]
    );
    assert.equal(ownerStates.rowCount, 2);
    for (const row of ownerStates.rows) {
      assert.equal(Number(row.owner_id), Number(row.version_owner_id));
    }
  } finally {
    for (const id of legacyBaseWordIds) {
      await pool.query('DELETE FROM base_words WHERE id = $1 AND owner_id = $2', [id, legacyId]);
    }
    if (legacyEntryIds.length) {
      for (const tableName of [
        'curated_matches',
        'explicit_milui_interpretations',
        'saved_entry_milui_form_index',
        'saved_entry_milui_index',
        'saved_entry_milui_save_modes',
        'saved_words',
      ]) {
        const entryColumn = tableName === 'curated_matches'
          ? 'parent_id'
          : tableName === 'explicit_milui_interpretations'
            ? 'linked_saved_entry_id'
            : tableName === 'saved_words'
              ? 'entry_id'
              : 'saved_entry_id';
        await pool.query(
          `DELETE FROM ${tableName}
           WHERE ${entryColumn} = ANY($1::bigint[]) AND owner_id = $2`,
          [legacyEntryIds, legacyId]
        );
      }
      await pool.query(
        'DELETE FROM saved_entries WHERE id = ANY($1::bigint[]) AND owner_id = $2',
        [legacyEntryIds, legacyId]
      );
    }
    if (standardAccount) {
      const standardId = Number(standardAccount.id);
      for (const tableName of [
        'curated_matches',
        'explicit_milui_interpretations',
        'saved_entry_milui_form_index',
        'saved_entry_milui_index',
        'saved_entry_milui_save_modes',
        'saved_words',
        'saved_entries',
        'base_words',
        'milui_preferences',
        'milui_index_state',
        'milui_mapping_versions',
      ]) {
        await pool.query(`DELETE FROM ${tableName} WHERE owner_id = $1`, [standardId]);
      }
      await pool.query(
        `DELETE FROM app_accounts
         WHERE id = $1 AND account_type = 'standard' AND email = $2`,
        [standardAccount.id, email.toLowerCase()]
      );
    }
    if (await tableExists('session')) {
      const currentSessionIds = (await pool.query('SELECT sid FROM "session"')).rows.map(row => row.sid);
      const createdSessionIds = currentSessionIds.filter(sid => !existingSessionIds.has(sid));
      if (createdSessionIds.length) {
        await pool.query('DELETE FROM "session" WHERE sid = ANY($1::text[])', [createdSessionIds]);
      }
    }
  }

  const beforeRepeat = await capturePrivateRows();
  const firstRepeat = await ensureMultiUserFoundation(pool, { allowSchemaChanges: true });
  assertNoBackfills(firstRepeat);
  const afterFirstRepeat = await capturePrivateRows();
  assert.deepEqual(contentSnapshot(afterFirstRepeat), contentSnapshot(beforeRepeat));
  const secondRepeat = await ensureMultiUserFoundation(pool, { allowSchemaChanges: true });
  assertNoBackfills(secondRepeat);
  const afterSecondRepeat = await capturePrivateRows();
  assert.deepEqual(contentSnapshot(afterSecondRepeat), contentSnapshot(beforeRepeat));
});
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routedPool } from '../server/databaseRouter.js';
import { runWithRequestDatabase } from '../server/requestDatabase.js';

function recordingDatabase(databaseRole) {
  const calls = [];
  return {
    databaseRole,
    calls,
    async query(sql, params) {
      await new Promise(resolve => setImmediate(resolve));
      calls.push({ method: 'query', sql, params });
      return { rows: [{ databaseRole }], rowCount: 1 };
    },
    async connect() {
      calls.push({ method: 'connect' });
      return {};
    },
  };
}

test('request-routed private access never falls back without an authenticated database', () => {
  assert.throws(
    () => routedPool.query('SELECT 1'),
    /No authenticated request database is configured/
  );
});

test('identical owner IDs remain isolated by authenticated database role', async () => {
  const legacy = recordingDatabase('legacy');
  const multiUser = recordingDatabase('multi-user');
  const ownerId = 1;

  const [legacyResult, multiUserResult] = await Promise.all([
    runWithRequestDatabase(legacy, async () => {
      assert.equal(routedPool.databaseRole, 'legacy');
      return routedPool.query(
        'SELECT id FROM saved_entries WHERE owner_id = $1',
        [ownerId]
      );
    }),
    runWithRequestDatabase(multiUser, async () => {
      assert.equal(routedPool.databaseRole, 'multi-user');
      return routedPool.query(
        'SELECT id FROM saved_entries WHERE owner_id = $1',
        [ownerId]
      );
    }),
  ]);

  assert.equal(legacyResult.rows[0].databaseRole, 'legacy');
  assert.equal(multiUserResult.rows[0].databaseRole, 'multi-user');
  assert.equal(legacy.calls.length, 1);
  assert.equal(multiUser.calls.length, 1);
  assert.deepEqual(legacy.calls[0].params, [ownerId]);
  assert.deepEqual(multiUser.calls[0].params, [ownerId]);
});

test('request-routed transactions connect only to the authenticated database', async () => {
  const legacy = recordingDatabase('legacy');
  const multiUser = recordingDatabase('multi-user');

  const legacyClient = await runWithRequestDatabase(legacy, () => routedPool.connect());
  const multiUserClient = await runWithRequestDatabase(multiUser, () => routedPool.connect());

  assert.equal(legacyClient.databaseRole, 'legacy');
  assert.equal(multiUserClient.databaseRole, 'multi-user');
  assert.deepEqual(legacy.calls, [{ method: 'connect' }]);
  assert.deepEqual(multiUser.calls, [{ method: 'connect' }]);
});
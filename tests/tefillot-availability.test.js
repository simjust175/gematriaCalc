import assert from 'node:assert/strict';
import test from 'node:test';
import { isTefillotAvailable } from '../server/tefillot.js';

function fakeDatabase({ sources = true, units = true, populated = true } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ sources, units }] };
      if (sql.includes('SELECT EXISTS')) return { rows: [{ populated }] };
      throw new Error('Unexpected database query');
    },
  };
}

test('Tefillot remains unavailable without schema, content, or an enabled environment', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.TEFILLOT_ENABLED;
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.TEFILLOT_ENABLED;
    assert.equal(await isTefillotAvailable(fakeDatabase({ sources: false })), false);
    assert.equal(await isTefillotAvailable(fakeDatabase({ units: false })), false);
    assert.equal(await isTefillotAvailable(fakeDatabase({ populated: false })), false);
    assert.equal(await isTefillotAvailable(fakeDatabase()), true);

    process.env.TEFILLOT_ENABLED = 'false';
    const disabled = fakeDatabase();
    assert.equal(await isTefillotAvailable(disabled), false);
    assert.equal(disabled.queries.length, 0);

    process.env.NODE_ENV = 'production';
    delete process.env.TEFILLOT_ENABLED;
    const production = fakeDatabase();
    assert.equal(await isTefillotAvailable(production), false);
    assert.equal(production.queries.length, 0);
    process.env.TEFILLOT_ENABLED = 'true';
    assert.equal(await isTefillotAvailable(fakeDatabase({ populated: false })), false);
    assert.equal(await isTefillotAvailable(fakeDatabase()), true);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag === undefined) delete process.env.TEFILLOT_ENABLED;
    else process.env.TEFILLOT_ENABLED = originalFlag;
  }
});
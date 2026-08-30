import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import {
  calculateExactMultiple,
  groupExactMultiples,
  parseMultipleDiscoveryQuery,
} from '../server/multipleDiscovery.js';
import { useMultipleDiscovery } from '../src/composables/useMultipleDiscovery.js';

test('multiple query accepts only bounded positive integers', () => {
  assert.deepEqual(parseMultipleDiscoveryQuery({ value: '951' }), { value: 951 });
  assert.deepEqual(parseMultipleDiscoveryQuery({ value: '100400' }), { value: 100400 });
  for (const value of ['', '0', '-3', '2.5', '9007199254740992', 'not-a-number']) {
    assert.equal(parseMultipleDiscoveryQuery({ value }).error, 'invalid_multiple_value');
  }
});

test('exact multiple arithmetic supports both directions and excludes noise', () => {
  assert.deepEqual(calculateExactMultiple(3, 12), {
    direction: 'into_current',
    multiplier: 4,
  });
  assert.deepEqual(calculateExactMultiple(48, 12), {
    direction: 'current_into_saved',
    multiplier: 4,
  });
  assert.equal(calculateExactMultiple(12, 12), null, '×1 is excluded');
  assert.equal(calculateExactMultiple(1, 12), null, 'source value 1 is excluded');
  assert.equal(calculateExactMultiple(0, 12), null);
  assert.equal(calculateExactMultiple(-3, 12), null);
  assert.equal(calculateExactMultiple(5, 12), null, 'fractions are excluded');
});

test('multiple rows consolidate per saved entry and rank multiplier before source type', () => {
  const rows = [
    {
      entry_id: 2,
      original_text: 'ערך שני',
      created_at: '2026-08-30T00:00:00Z',
      source_type: 'full_gematria',
      source_value: 15,
    },
    {
      entry_id: 1,
      original_text: 'ערך ראשון',
      created_at: '2026-08-31T00:00:00Z',
      source_type: 'saved_word',
      source_word: 'תיבה',
      source_value: 6,
    },
    {
      entry_id: 1,
      original_text: 'ערך ראשון',
      created_at: '2026-08-31T00:00:00Z',
      source_type: 'full_gematria',
      source_value: 10,
    },
    {
      entry_id: 1,
      original_text: 'ערך ראשון',
      created_at: '2026-08-31T00:00:00Z',
      source_type: 'full_gematria',
      source_value: 10,
    },
    {
      entry_id: 3,
      original_text: 'ערך גדול',
      created_at: '2026-08-29T00:00:00Z',
      source_type: 'milui_gematria',
      source_value: 120,
    },
    {
      entry_id: 4,
      original_text: 'אות אחת',
      source_type: 'initials_gematria',
      source_value: 1,
    },
  ];

  const groups = groupExactMultiples(rows, 30);
  const intoCurrent = groups.find(group => group.key === 'into_current');
  const currentIntoSaved = groups.find(group => group.key === 'current_into_saved');

  assert.deepEqual(intoCurrent.entries.map(entry => entry.entryId), [2, 1]);
  assert.equal(intoCurrent.entries[1].relationships.length, 2, 'duplicate source rows are removed');
  assert.deepEqual(
    intoCurrent.entries[1].relationships.map(item => [item.sourceType, item.multiplier]),
    [['full_gematria', 3], ['saved_word', 5]]
  );
  assert.deepEqual(currentIntoSaved.entries.map(entry => entry.entryId), [3]);
  assert.equal(currentIntoSaved.entries[0].relationships[0].multiplier, 4);
});

test('multiple discovery stays silent while closed and ignores stale responses', async () => {
  const pending = [];
  const fetchImpl = (url, options) => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    pending.push({ url: String(url), signal: options.signal, resolve });
    return promise;
  };
  const response = payload => ({ ok: true, json: async () => payload });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const value = ref(12);
  const open = ref(false);
  const live = useMultipleDiscovery(value, open, { fetchImpl, debounceMs: 0 });

  try {
    await flush();
    assert.equal(pending.length, 0, 'closed disclosure makes no request');

    open.value = true;
    await flush();
    assert.equal(pending.length, 1);
    assert.match(pending[0].url, /value=12/);

    value.value = 18;
    assert.equal(pending[0].signal.aborted, true);
    await flush();
    assert.equal(pending.length, 2);
    assert.match(pending[1].url, /value=18/);

    pending[1].resolve(response({
      currentValue: 18,
      groups: [{ key: 'into_current', entries: [{ entryId: 2 }] }],
    }));
    await flush();
    assert.equal(live.state.value.currentValue, 18);
    assert.equal(live.state.value.groups[0].entries[0].entryId, 2);

    pending[0].resolve(response({
      currentValue: 12,
      groups: [{ key: 'into_current', entries: [{ entryId: 1 }] }],
    }));
    await flush();
    assert.equal(live.state.value.groups[0].entries[0].entryId, 2);

    open.value = false;
    assert.deepEqual(live.state.value.groups, []);
    value.value = 24;
    await flush();
    assert.equal(pending.length, 2, 'input changes while closed remain silent');
  } finally {
    live.stop();
  }
});
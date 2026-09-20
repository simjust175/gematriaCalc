import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTefillotGematriaCaches,
  parseTefillotGematriaQuery,
  searchTefillotGematria,
} from '../server/tefillotGematriaDiscovery.js';
import { effectScope, ref } from 'vue';
import { useTanachGematriaMatches } from '../src/composables/useTanachGematriaMatches.js';

function fakeDb(units) {
  return {
    async query(sql) {
      if (sql.includes('MAX(imported_at)')) {
        return { rows: [{ imported_at: 'test', unit_count: units.length }] };
      }
      if (sql.includes('FROM tefillot_units u')) return { rows: units };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

const unit = (overrides = {}) => ({
  id: 1,
  occasion_slug: 'weekday',
  occasion_label: 'ימות החול',
  occasion_order: 1,
  service_slug: 'shacharit',
  service_label: 'שחרית',
  service_order: 3,
  section_key: 'morning',
  section_label: 'ברכות השחר',
  section_order: 10,
  subsection: null,
  sequence: 1,
  hebrew_text: 'בראשית ברא אלהים',
  source_reference: 'Siddur Sefard 1',
  source_work: 'Siddur Sefard',
  source_version: 'Reusable',
  license: 'CC-BY',
  version_source: 'https://example.com/version',
  source_url: 'https://example.com/source',
  ...overrides,
});

test('Tefillot discovery query validates methods and source filters', () => {
  assert.equal(parseTefillotGematriaQuery({
    method: 'gematria', value: '913', type: 'all', occasion: 'festival', service: 'musaf',
  }).occasion, 'festival');
  assert.equal(parseTefillotGematriaQuery({ method: 'gematria', value: '0' }).error, 'invalid_gematria_value');
  assert.equal(parseTefillotGematriaQuery({ method: 'initials', sequence: 'בא' }).wordCount, 2);
  assert.equal(parseTefillotGematriaQuery({ method: 'finals', sequence: 'תא', order_independent: 'true' }).orderIndependent, true);
  assert.equal(parseTefillotGematriaQuery({ method: 'gematria', value: '913', occasion: 'rosh-hashanah' }).error, 'invalid_occasion_filter');
});

test('Tefillot discovery preserves context, source identity, counts, and pagination', async () => {
  clearTefillotGematriaCaches();
  const db = fakeDb([
    unit(),
    unit({ id: 2, occasion_slug: 'pesach', occasion_label: 'פסח', service_slug: 'musaf', service_label: 'מוסף' }),
  ]);
  const result = await searchTefillotGematria(db, {
    method: 'gematria',
    value: 913,
    type: 'all',
    occasion: '',
    service: '',
    page: 1,
    limit: 1,
  });
  assert.equal(result.total, 2);
  assert.equal(result.counts.whole_word, 2);
  assert.equal(result.results.length, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.results[0].sourceType, 'tefillot');
  assert.equal(result.results[0].sectionLabel, 'ברכות השחר');
  assert.equal(result.results[0].sourceReference, 'Siddur Sefard 1');
});

test('Tefillot discovery applies festival/service filters and exact edge methods', async () => {
  clearTefillotGematriaCaches();
  const db = fakeDb([
    unit(),
    unit({
      id: 2,
      occasion_slug: 'pesach',
      occasion_label: 'פסח',
      service_slug: 'musaf',
      service_label: 'מוסף',
      hebrew_text: 'בראשית אלהים',
    }),
  ]);
  const festival = await searchTefillotGematria(db, {
    method: 'initials',
    sequence: 'בא',
    wordCount: 2,
    orderIndependent: false,
    type: 'all',
    occasion: 'festival',
    service: 'musaf',
    page: 1,
    limit: 12,
  });
  assert.equal(festival.total, 1);
  assert.equal(festival.results[0].occasionSlug, 'pesach');

  const finals = await searchTefillotGematria(db, {
    method: 'finals',
    sequence: 'תם',
    wordCount: 2,
    orderIndependent: false,
    type: 'all',
    occasion: 'festival',
    service: 'musaf',
    page: 1,
    limit: 12,
  });
  assert.equal(finals.total, 1);
});

test('source modes query their own endpoint and all mode unions both sources', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const params = new URL(url, 'https://example.test').searchParams;
    const page = Number(params.get('page'));
    const isTanach = url.includes('/api/tanach/');
    const total = isTanach ? 15 : 7;
    const offset = (page - 1) * 12;
    const count = Math.max(0, Math.min(12, total - offset));
    return {
      ok: true,
      async json() {
        return {
          results: Array.from({ length: count }, (_, index) => ({
            id: `${isTanach ? 'tanach' : 'tefillot'}-${offset + index}`,
            ...(isTanach ? {} : { sourceType: 'tefillot' }),
          })),
          counts: { all: total, whole_word: total, whole_phrase: 0, partial: 0 },
          total,
          page,
          limit: 12,
          hasMore: offset + count < total,
        };
      },
    };
  };

  for (const source of ['tanach', 'tefillot']) {
    calls.length = 0;
    const scope = effectScope();
    const api = scope.run(() => useTanachGematriaMatches(ref(45), {
      fetchImpl,
      debounceMs: 0,
      limit: 12,
      sourceRef: ref(source),
      methodRef: ref('gematria'),
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes(`/api/${source}/gematria-matches?`));
    assert.equal(api.total.value, source === 'tanach' ? 15 : 7);
    scope.stop();
  }

  calls.length = 0;
  const scope = effectScope();
  const api = scope.run(() => useTanachGematriaMatches(ref(45), {
    fetchImpl,
    debounceMs: 0,
    limit: 12,
    sourceRef: ref('all'),
    methodRef: ref('gematria'),
  }));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(api.results.value.length, 19);
  assert.equal(calls.length, 2);
  assert.ok(calls.some(url => url.includes('/api/tanach/gematria-matches?')));
  assert.ok(calls.some(url => url.includes('/api/tefillot/gematria-matches?')));
  assert.deepEqual(api.sourceCounts.value, { tanach: 15, tefillot: 7 });
  assert.deepEqual(new Set(api.results.value.map(item => item.sourceType)), new Set(['tanach', 'tefillot']));
  await api.loadMore();
  assert.equal(api.results.value.length, 22);
  assert.equal(new Set(api.results.value.map(item => item.id)).size, 22);
  assert.equal(api.total.value, 22);
  assert.equal(api.hasMore.value, false);
  scope.stop();
});

test('all mode preserves either successful source when the other source fails', async () => {
  for (const failedSource of ['tefillot', 'tanach']) {
    const successfulSource = failedSource === 'tefillot' ? 'tanach' : 'tefillot';
    const successfulTotal = successfulSource === 'tanach' ? 697 : 23;
    const scope = effectScope();
    const api = scope.run(() => useTanachGematriaMatches(ref(45), {
      fetchImpl: async url => {
        if (url.includes(`/api/${failedSource}/`)) return { ok: false };
        return {
          ok: true,
          async json() {
            return {
              results: [{
                id: `${successfulSource}-1`,
                ...(successfulSource === 'tefillot' ? { sourceType: 'tefillot' } : {}),
              }],
              counts: {
                all: successfulTotal,
                whole_word: successfulTotal,
                whole_phrase: 0,
                partial: 0,
              },
              total: successfulTotal,
              hasMore: false,
            };
          },
        };
      },
      debounceMs: 0,
      sourceRef: ref('all'),
      methodRef: ref('gematria'),
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(api.results.value.length, 1);
    assert.equal(api.results.value[0].sourceType, successfulSource);
    assert.equal(api.total.value, successfulTotal);
    assert.deepEqual(api.sourceCounts.value, {
      tanach: successfulSource === 'tanach' ? successfulTotal : 0,
      tefillot: successfulSource === 'tefillot' ? successfulTotal : 0,
    });
    assert.equal(api.error.value, '');
    scope.stop();
  }
});

test('interim availability gate never calls Tefillot and keeps Tanach active in all mode', async () => {
  for (const source of ['tefillot', 'all', 'tanach']) {
    const calls = [];
    const scope = effectScope();
    const api = scope.run(() => useTanachGematriaMatches(ref(44), {
      fetchImpl: async url => {
        calls.push(url);
        if (url.includes('/api/tefillot/')) {
          throw new Error('Tefillot endpoint must not be called while unavailable');
        }
        return {
          ok: true,
          async json() {
            return {
              results: [{ id: 'tanach-1' }],
              counts: { all: 697, whole_word: 497, whole_phrase: 200, partial: 0 },
              total: 697,
              hasMore: false,
            };
          },
        };
      },
      debounceMs: 0,
      sourceRef: ref(source),
      methodRef: ref('gematria'),
      tefillotAvailable: false,
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls.some(url => url.includes('/api/tefillot/')), false);
    assert.equal(calls.filter(url => url.includes('/api/tanach/')).length, source === 'tefillot' ? 0 : 1);
    assert.equal(api.total.value, source === 'tefillot' ? 0 : 697);
    assert.equal(api.error.value, '');
    scope.stop();
  }
});
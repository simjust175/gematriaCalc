import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combineDiscoveryPayloads,
} from '../server/tefillot.js';
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

test('combined discovery keeps each page within the configured limit without duplicates', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const params = new URL(url, 'https://example.test').searchParams;
    const page = Number(params.get('page'));
    const limit = Number(params.get('limit'));
    const offset = (page - 1) * limit;
    const count = page === 1 ? limit : 7;
    return {
      ok: true,
      async json() {
        return {
          results: Array.from({ length: count }, (_, index) => ({
            id: `${index % 2 ? 'tefillot' : 'tanach'}-${offset + index}`,
            sourceType: index % 2 ? 'tefillot' : 'tanach',
          })),
          counts: { all: 22, whole_word: 18, whole_phrase: 4, partial: 3 },
          sourceCounts: { tanach: 15, tefillot: 7 },
          total: 22,
          page,
          limit,
          hasMore: page <= 2,
        };
      },
    };
  };

  const scope = effectScope();
  const api = scope.run(() => useTanachGematriaMatches(ref(45), {
    fetchImpl,
    debounceMs: 0,
    limit: 12,
    sourceRef: ref('all'),
    methodRef: ref('gematria'),
  }));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(api.results.value.length, 12);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('/api/discovery/gematria-matches?'));
  assert.deepEqual(api.sourceCounts.value, { tanach: 15, tefillot: 7 });
  assert.deepEqual(new Set(api.results.value.map(item => item.sourceType)), new Set(['tanach', 'tefillot']));
  await api.loadMore();
  assert.equal(api.results.value.length, 19);
  assert.equal(new Set(api.results.value.map(item => item.id)).size, 19);
  assert.equal(api.total.value, 22);
  assert.equal(api.hasMore.value, true);
  scope.stop();
});

test('combined discovery merges both sources and sums totals and filter counts', () => {
  const result = combineDiscoveryPayloads({
    method: 'gematria',
    results: [{ bookSlug: 'Genesis', text: 'א' }],
    counts: { all: 8, whole_word: 6, whole_phrase: 2, partial: 4 },
    total: 8,
    page: 1,
    hasMore: true,
  }, {
    method: 'gematria',
    results: [{ unitId: 4, text: 'ב' }],
    counts: { all: 5, whole_word: 3, whole_phrase: 2, partial: 1 },
    total: 5,
    page: 1,
    hasMore: false,
  }, 12);

  assert.deepEqual(result.results.map(item => item.sourceType), ['tanach', 'tefillot']);
  assert.deepEqual(result.sourceCounts, { tanach: 8, tefillot: 5 });
  assert.deepEqual(result.counts, {
    all: 13,
    whole_word: 9,
    whole_phrase: 4,
    partial: 5,
  });
  assert.equal(result.total, 13);
  assert.equal(result.hasMore, true);
});
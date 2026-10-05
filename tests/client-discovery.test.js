import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { ref, effectScope } from 'vue';
import { normalize, calcGematria } from '../src/composables/useGematria.js';
import { useTanachGematriaMatches } from '../src/composables/useTanachGematriaMatches.js';
import { isWholeVerseMatch, parseGematriaSearchQuery, searchTanachGematria } from '../server/tanachGematriaDiscovery.js';
import {
  parseSuggestionQuery, selectSuggestions, suggestionSnippet, registerCorpusSuggestionRoutes,
} from '../server/corpusSuggestions.js';

let revision = 0;
function fakeDb(verses, prayers = [], enabled = false) {
  const stamp = `client-discovery-${++revision}`;
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ sources: enabled, units: enabled }] };
      if (sql.includes('SELECT EXISTS')) return { rows: [{ populated: enabled }] };
      if (sql.includes('MAX(imported_at)')) return { rows: [{ imported_at: stamp, representation_version: 1, unit_count: prayers.length }] };
      if (sql.includes('FROM tanach_verses v')) return { rows: verses };
      if (sql.includes('FROM tefillot_units u')) return { rows: prayers };
      throw new Error(`Unexpected SQL ${sql}`);
    },
  };
}
const verse = (text, number = 1) => ({
  book_slug: 'Genesis', book_name: 'בראשית', chapter: 1, verse: number, canonical_order: 1, display_text: text,
});
const prayer = (text, id = 1) => ({
  id, hebrew_text: text, occasion_label: 'חול', service_label: 'שחרית', section_label: 'ברכות השחר',
});
const options = (value, type = 'all', extra = {}) => ({
  method: 'gematria', value, type, page: 1, limit: 12, ...extra,
});

test('whole verse requires complete canonical letter range and exact full target', () => {
  assert.equal(isWholeVerseMatch('אָב־ג׃', { start: 0, end: 2 }, 6), true);
  for (const [range, target] of [[{ start: 0, end: 1 }, 6], [{ start: 1, end: 2 }, 6], [{ start: 0, end: 2 }, 5]]) {
    assert.equal(isWholeVerseMatch('אָב־ג׃', range, target), false);
  }
  assert.equal(isWholeVerseMatch('  ', { start: 0, end: -1 }, 0), false);
  assert.equal(parseGematriaSearchQuery({ value: '6', type: 'whole_verse' }).type, 'whole_verse');
});

test('whole-verse counts are additive; original classifications/all and pagination stay unchanged', async () => {
  const db = fakeDb([verse('אָב־ג׃'), verse('אב ג ד', 2), verse('ו', 3)]);
  const all = await searchTanachGematria(db, options(6));
  assert.equal(all.counts.all, 3);
  assert.equal(all.counts.whole_phrase, 2);
  assert.equal(all.counts.whole_word, 1);
  assert.equal(all.counts.whole_verse, 2);
  const full = await searchTanachGematria(db, options(6, 'whole_verse', { limit: 1 }));
  assert.equal(full.total, 2);
  assert.equal(full.hasMore, true);
  assert.equal(full.results[0].verse, 1);
  const second = await searchTanachGematria(db, options(6, 'whole_verse', { limit: 1, page: 2 }));
  assert.equal(second.results[0].verse, 3);
  assert.equal(second.hasMore, false);
  const zero = await searchTanachGematria(db, options(5, 'whole_verse'));
  assert.equal(zero.total, 0);
  assert.deepEqual(zero.results, []);
  const scoped = await searchTanachGematria(db, options(6, 'whole_verse', { verse: 2 }));
  assert.equal(scoped.counts.whole_verse, 0);
});

test('Kollel full-verse filter uses adjusted target, Tanach-only results in all mode, and resets for prayers', async () => {
  const scope = effectScope();
  const calls = [];
  const source = ref('all');
  const method = ref('gematria');
  const api = scope.run(() => useTanachGematriaMatches(ref(5), {
    sourceRef: source, methodRef: method, tefillotAvailable: ref(true), debounceMs: 0,
    fetchImpl: async url => {
      calls.push(url);
      const tanach = url.includes('/tanach/');
      return {
        ok: true, json: async () => ({
          results: [{ sourceType: tanach ? 'tanach' : 'tefillot', text: 'ו' }],
          counts: { all: 3, whole_word: 1, whole_phrase: 2, whole_verse: tanach ? 1 : 99 },
          total: 1, hasMore: !tanach,
        }),
      };
    },
  }));
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    api.setIncludeKollel(true);
    api.setFilter('whole_verse');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(calls.some(url => url.includes('value=6') && url.includes('type=whole_verse')));
    assert.equal(api.counts.value.whole_verse, 1);
    assert.equal(api.results.value.length, 1);
    assert.equal(api.results.value[0].sourceType, 'tanach');
    assert.equal(api.hasMore.value, false);
    source.value = 'tefillot';
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(api.filter.value, 'all');
    api.setFilter('whole_verse');
    assert.equal(api.filter.value, 'all');
    source.value = 'all';
    api.setFilter('whole_verse');
    method.value = 'initials';
    assert.equal(api.filter.value, 'all');
  } finally { scope.stop(); }
});

test('whole-verse discovery explicitly fails if Tanach fails even when prayer counts load', async () => {
  const scope = effectScope();
  const api = scope.run(() => useTanachGematriaMatches(ref(6), {
    sourceRef: ref('all'), tefillotAvailable: ref(true), debounceMs: 0,
    fetchImpl: async url => ({
      ok: !url.includes('/tanach/'),
      json: async () => ({ results: [], counts: { all: 10 }, total: 10 }),
    }),
  }));
  try {
    api.setFilter('whole_verse');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(api.error.value, /תנ״ך/);
    assert.deepEqual(api.results.value, []);
  } finally { scope.stop(); }
});

test('autocomplete validates bounds, minimum Hebrew letters and canonical normalization', () => {
  for (const q of ['שְׁמַע־יִשְׂרָאֵל', 'שמע—ישראל'.replace('—', '־'), 'שמע   ישראל', 'שמע׳ ישראל״!']) {
    assert.equal(parseSuggestionQuery({ q }).text, normalize(q));
  }
  for (const q of ['א', 'אב', '123', 'abc', '!!!']) assert.equal(parseSuggestionQuery({ q }).eligible, false);
  assert.equal(parseSuggestionQuery({ q: ['שמע'] }).error, 'invalid_query');
  assert.equal(parseSuggestionQuery({ q: 'א'.repeat(161) }).error, 'invalid_query');
  assert.equal(parseSuggestionQuery({ q: 'שמע', limit: '11' }).error, 'invalid_limit');
});

test('autocomplete ranks exact then prefix then word-boundary then substring; prefers compact matches', () => {
  const corpus = [
    verse('אבשמע', 1), verse('א שמע ישראל', 2), verse('שמע ישראל ישראל ישראל', 3),
    verse('שמע ישראל', 4), verse('שמע', 5),
  ];
  const results = selectSuggestions([{ corpus, sourceType: 'tanach' }], 'שמע', 8);
  assert.deepEqual(results.map(row => row.id.split(':').at(-1)), ['5', '4', '3', '2', '1']);
});

test('autocomplete keeps server canonical complete text and gold snippet boundaries with niqqud', () => {
  const text = 'בָּרוּךְ שְׁמַע־יִשְׂרָאֵל אֶחָד';
  const corpora = [
    { corpus: [verse(text)], sourceType: 'tanach' },
    { corpus: [prayer('שְׁמַע יִשְׂרָאֵל')], sourceType: 'tefillot' },
  ];
  const results = selectSuggestions(corpora, normalize('שמעישראל'));
  assert.equal(results.length, 2);
  assert.deepEqual(new Set(results.map(row => row.sourceType)), new Set(['tanach', 'tefillot']));
  assert.equal(results.find(row => row.sourceType === 'tanach').text, text);
  assert.equal(results.find(row => row.sourceType === 'tanach').context, 'בראשית א:א');
  assert.match(results.find(row => row.sourceType === 'tefillot').context, /חול · שחרית · ברכות השחר/);
  const snippet = suggestionSnippet(text, 'שמע ישראל');
  assert.equal(normalize(snippet.match), 'שמע ישראל');
  assert.equal(snippet.before + snippet.match + snippet.after, text);
  assert.equal(calcGematria(normalize(results[0].text)), calcGematria(normalize('שמע ישראל')));
});

test('autocomplete deduplicates repeated canonical units, bounds output and handles spacing differences', () => {
  const corpus = Array.from({ length: 30 }, (_, index) => prayer('שמע ישראל', index));
  assert.equal(selectSuggestions([{ corpus, sourceType: 'tefillot' }], 'שמעישראל', 8).length, 1);
  const varied = Array.from({ length: 30 }, (_, index) => verse(`שמע ${'א'.repeat(index + 1)}`, index));
  assert.equal(selectSuggestions([{ corpus: varied, sourceType: 'tanach' }], 'שמע', 8).length, 8);
});

test('autocomplete highlights the actual spaced phrase rather than an earlier compact-only match', () => {
  const text = 'כִּי הַמֶּלֶךְ ה׳ מֶלֶךְ';
  const snippet = suggestionSnippet(text, 'ה מלך');
  assert.equal(normalize(snippet.match), 'ה מלך');
  assert.equal(snippet.before + snippet.match + snippet.after, text);
});

test('authenticated suggestion API has Tanach-only disabled fallback and never queries private tables', async () => {
  const db = fakeDb([verse('שמע ישראל')], [], false);
  const app = express();
  registerCorpusSuggestionRoutes(app, {
    pool: db,
    requireAuth: (req, res, next) => req.get('x-private-session') === 'test' ? next() : res.sendStatus(401),
  });
  assert.equal((await request(app).get('/api/corpus/suggestions?q=שמע')).status, 401);
  const result = await request(app).get('/api/corpus/suggestions').query({ q: 'שְׁמַע' }).set('x-private-session', 'test');
  assert.equal(result.status, 200);
  assert.equal(result.body.results[0].sourceType, 'tanach');
  assert.equal(db.calls.some(sql => sql.includes('FROM tefillot_units u')), false);
  assert.equal(db.calls.some(sql => /saved_entries|base_words|saved_words/.test(sql)), false);
  const invalid = await request(app).get('/api/corpus/suggestions').query({ q: 'שמע', limit: 999 }).set('x-private-session', 'test');
  assert.equal(invalid.status, 400);
  const count = db.calls.length;
  const short = await request(app).get('/api/corpus/suggestions').query({ q: 'אב' }).set('x-private-session', 'test');
  assert.deepEqual(short.body.results, []);
  assert.equal(db.calls.length, count);
});

test('autocomplete bounded top-list selection stays fast on a Tanach-sized corpus', () => {
  const corpus = Array.from({ length: 23213 }, (_, index) => verse('בראשית ברא אלהים את השמים ואת הארץ', index + 1));
  const sources = [{ corpus, sourceType: 'tanach' }];
  selectSuggestions(sources, 'ברא', 8);
  const start = performance.now();
  selectSuggestions(sources, 'ברא', 8);
  assert.ok(performance.now() - start < 500, 'warm corpus matching exceeded a sensible debounce budget');
});

/**
 * Gematria engine tests — Node.js built-in test runner
 * Run: node --test tests/gematria.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import {
  normalize,
  calcGematria,
  toHebrewNumber,
  getInitials,
  getWordBreakdown,
  computeAll,
} from '../src/composables/useGematria.js';
import { useLiveMatching } from '../src/composables/useLiveMatching.js';
import { getMatchTypeMeta } from '../src/utils/matchTypes.js';

// ── Individual letter values ─────────────────────────────────────────────────
test('letter values — standard alphabet', () => {
  assert.equal(calcGematria('א'), 1);
  assert.equal(calcGematria('ב'), 2);
  assert.equal(calcGematria('י'), 10);
  assert.equal(calcGematria('כ'), 20);
  assert.equal(calcGematria('ל'), 30);
  assert.equal(calcGematria('מ'), 40);
  assert.equal(calcGematria('נ'), 50);
  assert.equal(calcGematria('ק'), 100);
  assert.equal(calcGematria('ר'), 200);
  assert.equal(calcGematria('ש'), 300);
  assert.equal(calcGematria('ת'), 400);
});

test('final letters use standard (non-enlarged) values', () => {
  assert.equal(calcGematria('ך'), 20);   // final kaf = 20
  assert.equal(calcGematria('ם'), 40);   // final mem = 40
  assert.equal(calcGematria('ן'), 50);   // final nun = 50
  assert.equal(calcGematria('ף'), 80);   // final pe  = 80
  assert.equal(calcGematria('ץ'), 90);   // final tsadi = 90
});

// ── Core word calculations ────────────────────────────────────────────────────
test('שמע = 410', () => {
  assert.equal(calcGematria('שמע'), 410);
});

test('ישראל = 541', () => {
  assert.equal(calcGematria('ישראל'), 541);
});

test('שמע ישראל full = 951', () => {
  const r = computeAll('שמע ישראל');
  assert.equal(r.fullGematria, 951);
});

// ── Spaces and punctuation are ignored ───────────────────────────────────────
test('spaces contribute 0 to gematria', () => {
  const withSpace    = computeAll('שמע ישראל');
  const withoutSpace = computeAll('שמעישראל');
  assert.equal(withSpace.fullGematria, withoutSpace.fullGematria);
});

test('multiple spaces handled correctly', () => {
  const r = computeAll('שמע   ישראל');
  assert.equal(r.fullGematria, 951);
});

test('punctuation is stripped', () => {
  assert.equal(calcGematria(normalize('שמע, ישראל!')), calcGematria('שמעישראל'));
});

test('niqqud is stripped', () => {
  // שְׁמַע with niqqud should equal שמע
  const withNiqqud = 'שְׁמַע';
  assert.equal(calcGematria(normalize(withNiqqud)), 410);
});

test('גרש / גרשיים stripped', () => {
  const withGersh = 'ש״מע';
  assert.equal(calcGematria(normalize(withGersh)), calcGematria('שמע'));
});

test('empty string returns null', () => {
  assert.equal(computeAll(''), null);
  assert.equal(computeAll('   '), null);
});

// ── ראשי תיבות ───────────────────────────────────────────────────────────────
test('ראשי תיבות of שמע ישראל = שי', () => {
  const r = computeAll('שמע ישראל');
  assert.equal(r.initials, 'שי');
});

test('ראשי תיבות gematria = 310', () => {
  const r = computeAll('שמע ישראל');
  assert.equal(r.initialsGematria, 310);
});

test('three-word initials: אברהם יצחק יעקב = איי', () => {
  const r = computeAll('אברהם יצחק יעקב');
  assert.equal(r.initials, 'איי');
});

// ── Word breakdown ────────────────────────────────────────────────────────────
test('word breakdown for שמע ישראל', () => {
  const r = computeAll('שמע ישראל');
  assert.equal(r.words.length, 2);
  assert.equal(r.words[0].word, 'שמע');
  assert.equal(r.words[0].gematria, 410);
  assert.equal(r.words[1].word, 'ישראל');
  assert.equal(r.words[1].gematria, 541);
});

test('letter breakdown for שמע', () => {
  const r = computeAll('שמע');
  const letters = r.words[0].letters;
  assert.deepEqual(letters, [
    { letter: 'ש', value: 300 },
    { letter: 'מ', value: 40 },
    { letter: 'ע', value: 70 },
  ]);
});

// ── Hebrew number conversion ──────────────────────────────────────────────────
test('toHebrewNumber: 21 = כא', () => { assert.equal(toHebrewNumber(21), 'כא'); });
test('toHebrewNumber: 39 = לט', () => { assert.equal(toHebrewNumber(39), 'לט'); });
test('toHebrewNumber: 132 = קלב', () => { assert.equal(toHebrewNumber(132), 'קלב'); });
test('toHebrewNumber: 310 = שי', () => { assert.equal(toHebrewNumber(310), 'שי'); });
test('toHebrewNumber: 410 = תי', () => { assert.equal(toHebrewNumber(410), 'תי'); });
test('toHebrewNumber: 541 = תקמא', () => { assert.equal(toHebrewNumber(541), 'תקמא'); });
test('toHebrewNumber: 951 = תתקנא', () => { assert.equal(toHebrewNumber(951), 'תתקנא'); });

test('toHebrewNumber: avoids יה — 15 = טו', () => { assert.equal(toHebrewNumber(15), 'טו'); });
test('toHebrewNumber: avoids יו — 16 = טז', () => { assert.equal(toHebrewNumber(16), 'טז'); });
test('toHebrewNumber: 115 = קטו', () => { assert.equal(toHebrewNumber(115), 'קטו'); });

// ── normalize ─────────────────────────────────────────────────────────────────
test('normalize preserves spaces for word splitting', () => {
  const n = normalize('שמע ישראל');
  assert.equal(n, 'שמע ישראל');
});

test('normalize collapses multiple spaces', () => {
  assert.equal(normalize('שמע   ישראל'), 'שמע ישראל');
});

// ── Live matching presentation and request ordering ───────────────────────────
test('match type identifiers map to explicit Hebrew badge labels', () => {
  assert.equal(getMatchTypeMeta('full_gematria').label, 'גימטריה מלאה');
  assert.equal(getMatchTypeMeta('initials_text').label, 'ראשי תיבות');
  assert.equal(getMatchTypeMeta('initials_gematria').label, 'גימטריית ר״ת');
  assert.equal(getMatchTypeMeta('saved_word').label, 'מילה שמורה');
});

test('live matching clears old reasons and ignores stale A → B → A responses', async () => {
  const pending = [];
  const fetchImpl = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    pending.push({ promise, resolve });
    return promise;
  };
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const response = payload => ({
    ok: true,
    json: async () => payload,
  });

  const result = ref(null);
  const live = useLiveMatching(result, { fetchImpl, debounceMs: 0 });

  try {
    const a = computeAll('שמע ישראל');
    const b = computeAll('אברהם יצחק יעקב');

    result.value = a;
    await flush();
    assert.equal(pending.length, 1);

    result.value = b;
    assert.deepEqual(live.matches.value.matches, []);
    await flush();
    assert.equal(pending.length, 2);

    result.value = a;
    assert.deepEqual(live.matches.value.matches, []);
    await flush();
    assert.equal(pending.length, 3);

    pending[2].resolve(response({
      matches: [{ id: 3, matchTypes: ['full_gematria'] }],
      isAlreadySaved: false,
    }));
    await flush();
    assert.equal(live.matches.value.matches[0].id, 3);

    pending[0].resolve(response({
      matches: [{ id: 1, matchTypes: ['initials_text'] }],
      isAlreadySaved: true,
    }));
    pending[1].resolve(response({
      matches: [{ id: 2, matchTypes: ['initials_gematria'] }],
      isAlreadySaved: true,
    }));
    await flush();

    assert.equal(live.matches.value.matches[0].id, 3);
    assert.equal(live.matches.value.isAlreadySaved, false);
  } finally {
    live.stop();
  }
});

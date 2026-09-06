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
  getFinals,
  getWordBreakdown,
  computeAll,
} from '../src/composables/useGematria.js';
import { useLiveMatching } from '../src/composables/useLiveMatching.js';
import { useTanachGematriaMatches } from '../src/composables/useTanachGematriaMatches.js';
import { getMatchTypeMeta } from '../src/utils/matchTypes.js';
import {
  mapFinalsToOriginalText,
  mapInitialsToOriginalText,
} from '../src/utils/initialsHighlight.js';
import {
  MILUI_BASE_LETTERS,
  MILUI_DEFAULT_MAPPING,
  calculateMilui,
  cloneMiluiMapping,
  normalizeMiluiMapping,
} from '../src/utils/milui.js';

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

test('סופי תיבות derives final Hebrew letters and their standard gematria', () => {
  const result = computeAll('שקנו בג שח');
  assert.equal(getFinals('שקנו בג שח'), 'וגח');
  assert.equal(result.finals, 'וגח');
  assert.equal(result.finalsGematria, 17);
  assert.equal(result.finalsHebrewNumber, 'יז');
});

test('סופי תיבות handles marks, punctuation, repeated spaces, duplicate words, and final forms', () => {
  assert.equal(getFinals('שָׁלוֹם,   חֵן! מֶלֶךְ דף עץ'), 'םןךףץ');
  assert.equal(getFinals('שלום שלום'), 'םם');
  assert.equal(getFinals('יחיד'), 'ד');
  assert.equal(calcGematria(getFinals('שָׁלוֹם,   חֵן! מֶלֶךְ דף עץ')), 280);
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
test('toHebrewNumber: handles the 14–21 boundary correctly', () => {
  const expected = new Map([
    [14, 'יד'],
    [15, 'טו'],
    [16, 'טז'],
    [17, 'יז'],
    [18, 'יח'],
    [19, 'יט'],
    [20, 'כ'],
    [21, 'כא'],
  ]);
  for (const [value, hebrew] of expected) {
    assert.equal(toHebrewNumber(value), hebrew, `${value} should be ${hebrew}`);
  }
});
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

// ── מילוי ─────────────────────────────────────────────────────────────────────
test('default מילוי table contains the exact 22-letter מילוי רגיל preset', () => {
  assert.equal(MILUI_BASE_LETTERS.length, 22);
  assert.deepEqual(MILUI_DEFAULT_MAPPING, {
    א: 'אלף', ב: 'בית', ג: 'גימל', ד: 'דלת', ה: 'הא', ו: 'ואו',
    ז: 'זין', ח: 'חית', ט: 'טית', י: 'יוד', כ: 'כף', ל: 'למד',
    מ: 'מם', נ: 'נון', ס: 'סמך', ע: 'עין', פ: 'פא', צ: 'צדי',
    ק: 'קוף', ר: 'ריש', ש: 'שין', ת: 'תו',
  });
});

test('א מילוי is אלף = 111 and per-letter מילוי בלבד is לף = 110', () => {
  const result = calculateMilui('א');
  assert.equal(result.expandedText, 'אלף');
  assert.equal(result.fullGematria, 111);
  assert.equal(result.fillingOnlyGematria, 110);
  assert.equal(result.words[0].letters[0].fillingOnly, 'לף');
  assert.equal(result.words[0].letters[0].fillingOnlyValue, 110);
});

test('ב מילוי is בית = 412 and per-letter מילוי בלבד is ית = 410', () => {
  const result = calculateMilui('ב');
  assert.equal(result.expandedText, 'בית');
  assert.equal(result.fullGematria, 412);
  assert.equal(result.fillingOnlyGematria, 410);
  assert.equal(result.words[0].letters[0].fillingOnly, 'ית');
  assert.equal(result.words[0].letters[0].fillingOnlyValue, 410);
});

test('אב expands to אלף בית = 523 with מילוי בלבד total 520', () => {
  const result = calculateMilui('אב');
  assert.equal(result.expandedText, 'אלף בית');
  assert.equal(result.fullGematria, 523);
  assert.equal(result.fillingOnlyGematria, 520);
});

test('מילוי preserves word groups and ignores whitespace, punctuation, niqqud, and cantillation', () => {
  const plain = calculateMilui('שמע ישראל');
  const decorated = calculateMilui('שְׁמַ֖ע,   יִשְׂרָאֵֽל!');
  assert.equal(plain.words.length, 2);
  assert.equal(decorated.fullGematria, plain.fullGematria);
  assert.equal(decorated.fillingOnlyGematria, plain.fillingOnlyGematria);
  assert.equal(calculateMilui('שמעישראל').fullGematria, plain.fullGematria);
});

test('final letters use their base-letter מילוי mappings', () => {
  const finalResult = calculateMilui('ךםןףץ');
  const baseResult = calculateMilui('כמנפצ');
  assert.equal(finalResult.expandedText, baseResult.expandedText);
  assert.equal(finalResult.fullGematria, baseResult.fullGematria);
  assert.equal(finalResult.fillingOnlyGematria, baseResult.fillingOnlyGematria);
  assert.deepEqual(
    finalResult.words[0].letters.map(letter => letter.baseLetter),
    ['כ', 'מ', 'נ', 'פ', 'צ']
  );
});

test('custom מילוי changes only מילוי calculations, not standard gematria', () => {
  const custom = cloneMiluiMapping();
  custom.ו = 'ויו';
  const standardBefore = computeAll('ו');
  const defaultMilui = calculateMilui('ו');
  const customMilui = calculateMilui('ו', custom);
  assert.equal(defaultMilui.expandedText, 'ואו');
  assert.equal(customMilui.expandedText, 'ויו');
  assert.notEqual(customMilui.fullGematria, defaultMilui.fullGematria);
  assert.notEqual(customMilui.fillingOnlyGematria, defaultMilui.fillingOnlyGematria);
  assert.deepEqual(computeAll('ו'), standardBefore);
});

test('מילוי mapping validation rejects blanks, non-Hebrew text, and wrong leading letters', () => {
  const blank = cloneMiluiMapping();
  blank.א = '';
  assert.equal(normalizeMiluiMapping(blank).valid, false);

  const latin = cloneMiluiMapping();
  latin.א = 'abc';
  assert.equal(normalizeMiluiMapping(latin).valid, false);

  const wrongInitial = cloneMiluiMapping();
  wrongInitial.א = 'לף';
  assert.equal(normalizeMiluiMapping(wrongInitial).valid, false);

  const finalLetterSetting = cloneMiluiMapping();
  finalLetterSetting.ך = 'כף';
  assert.equal(normalizeMiluiMapping(finalLetterSetting).valid, false);

  const arbitrarySetting = cloneMiluiMapping();
  arbitrarySetting.extra = 'אלף';
  assert.equal(normalizeMiluiMapping(arbitrarySetting).valid, false);
});

// ── Live matching presentation and request ordering ───────────────────────────
test('match type identifiers map to explicit Hebrew badge labels', () => {
  assert.equal(getMatchTypeMeta('full_gematria').label, 'גימטריה מלאה');
  assert.equal(getMatchTypeMeta('initials_text').label, 'ראשי תיבות');
  assert.equal(getMatchTypeMeta('initials_gematria').label, 'גימטריית ר״ת');
  assert.equal(getMatchTypeMeta('saved_word').label, 'התאמה בתיבה');
  assert.equal(getMatchTypeMeta('milui_gematria').label, 'התאמה במילוי');
});

test('initials highlighting maps exact source graphemes without changing original text', () => {
  const original = '  (שְׁקנו),   בּג  שֽח. ';
  const parts = mapInitialsToOriginalText(original, 'שבש');
  assert.ok(parts);
  assert.equal(parts.map(part => part.text).join(''), original);
  const highlighted = parts.flatMap(part => part.segments || [])
    .filter(segment => segment.derivedHighlighted);
  assert.deepEqual(highlighted.map(segment => normalize(segment.text)), ['ש', 'ב', 'ש']);
  assert.equal(highlighted.length, 3);
});

test('initials highlighting fails safely when source letters do not match metadata', () => {
  assert.equal(mapInitialsToOriginalText('שקנו בג שח', 'שטו'), null);
});

test('finals highlighting maps exact final graphemes and ignores trailing punctuation', () => {
  const original = 'שקנו,  בג שָׂח!';
  const parts = mapFinalsToOriginalText(original, 'וגח');
  assert.ok(parts);
  assert.equal(parts.map(part => part.text).join(''), original);
  const highlighted = parts.flatMap(part => part.segments || [])
    .filter(segment => segment.derivedHighlighted);
  assert.deepEqual(highlighted.map(segment => normalize(segment.text)), ['ו', 'ג', 'ח']);
  assert.equal(highlighted[2].text, 'ח');
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

test('live matching exposes request failures instead of a valid empty state', async () => {
  const result = ref(null);
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const live = useLiveMatching(result, { fetchImpl, debounceMs: 0 });
  try {
    result.value = computeAll('שמע');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(live.matches.value.error, true);
    assert.deepEqual(live.matches.value.matches, []);
  } finally {
    live.stop();
  }
});

test('Tanach discovery clears stale targets, filters server-side, and appends pages', async () => {
  const pending = [];
  const fetchImpl = (url) => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    pending.push({ url: String(url), resolve });
    return promise;
  };
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const response = payload => ({ ok: true, json: async () => payload });
  const target = ref(913);
  const live = useTanachGematriaMatches(target, { fetchImpl, debounceMs: 0, limit: 2 });

  try {
    await flush();
    assert.equal(pending.length, 1);
    target.value = 1116;
    assert.deepEqual(live.results.value, []);
    await flush();
    assert.equal(pending.length, 2);

    pending[1].resolve(response({
      target: 1116,
      results: [{ bookSlug: 'Genesis', start: 0, end: 8 }],
      counts: { all: 3, whole_word: 0, whole_phrase: 1, partial: 2 },
      total: 3,
      page: 1,
      limit: 2,
      hasMore: true,
    }));
    await flush();
    assert.equal(live.results.value[0].end, 8);

    pending[0].resolve(response({
      target: 913,
      results: [{ bookSlug: 'stale', start: 0, end: 5 }],
      counts: { all: 1, whole_word: 1, whole_phrase: 0, partial: 0 },
      total: 1,
      page: 1,
      limit: 2,
      hasMore: false,
    }));
    await flush();
    assert.equal(live.results.value[0].bookSlug, 'Genesis');

    live.setFilter('partial');
    assert.deepEqual(live.results.value, []);
    await flush();
    assert.match(pending[2].url, /type=partial/);
    pending[2].resolve(response({
      target: 1116,
      results: [{ bookSlug: 'Genesis', start: 2, end: 9 }],
      counts: { all: 3, whole_word: 0, whole_phrase: 1, partial: 2 },
      total: 2,
      page: 1,
      limit: 2,
      hasMore: true,
    }));
    await flush();

    live.loadMore();
    assert.match(pending[3].url, /page=2/);
    pending[3].resolve(response({
      target: 1116,
      results: [{ bookSlug: 'Exodus', start: 4, end: 10 }],
      counts: { all: 3, whole_word: 0, whole_phrase: 1, partial: 2 },
      total: 2,
      page: 2,
      limit: 2,
      hasMore: false,
    }));
    await flush();
    assert.deepEqual(live.results.value.map(item => item.bookSlug), ['Genesis', 'Exodus']);
  } finally {
    live.stop();
  }
});

test('Tanach discovery scopes normalized search and weekly filters to its current target', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        results: [],
        counts: { all: 0, whole_word: 0, whole_phrase: 0, partial: 0 },
        total: 0,
        page: 1,
        limit: 12,
        hasMore: false,
        weeklyParshah: { id: 'ki-tavo', ids: ['ki-tavo'], nameHe: 'כי תבוא', isIsrael: true },
      }),
    };
  };
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const live = useTanachGematriaMatches(ref(913), { fetchImpl, debounceMs: 0 });

  try {
    await flush();
    live.setSearch('בְּרֵאשִׁ֖ית א:א');
    await flush();
    assert.match(urls.at(-1), /search=/);
    assert.equal(new URL(urls.at(-1), 'http://example.test').searchParams.get('search'), 'בְּרֵאשִׁ֖ית א:א');

    live.toggleCurrentParshah();
    await flush();
    assert.match(urls.at(-1), /parsha=current/);
    assert.equal(live.currentParshah.value, true);
    assert.equal(live.weeklyParshah.value.nameHe, 'כי תבוא');

    live.toggleCurrentParshah();
    await flush();
    assert.doesNotMatch(urls.at(-1), /parsha=current/);
    assert.equal(live.search.value, 'בְּרֵאשִׁ֖ית א:א', 'toggling weekly filter preserves search');
  } finally {
    live.stop();
  }
});

test('Tanach discovery composes book, parashah, chapter, and verse scopes with the weekly shortcut', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        results: [],
        counts: { all: 0, whole_word: 0, whole_phrase: 0, partial: 0 },
        total: 0,
        page: 1,
        limit: 12,
        hasMore: false,
        weeklyParshah: { id: 'ki-tavo', ids: ['ki-tavo'], nameHe: 'כי תבוא', isIsrael: true },
      }),
    };
  };
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const live = useTanachGematriaMatches(ref(26), { fetchImpl, debounceMs: 0 });

  try {
    await flush();
    live.setBookOrder(1);
    await flush();
    let params = new URL(urls.at(-1), 'http://example.test').searchParams;
    assert.equal(params.get('book_order'), '1');
    assert.equal(params.get('parsha_id'), null);
    assert.equal(live.currentParshah.value, false);

    live.setParshaId('vayetze');
    await flush();
    params = new URL(urls.at(-1), 'http://example.test').searchParams;
    assert.equal(params.get('book_order'), '1');
    assert.equal(params.get('parsha_id'), 'vayetze');

    live.setBookOrder(10);
    await flush();
    params = new URL(urls.at(-1), 'http://example.test').searchParams;
    assert.equal(live.parshaId.value, '', 'changing book resets an invalid parashah');
    assert.equal(params.get('book_order'), '10');
    assert.equal(params.get('parsha_id'), null);

    live.setChapter('Isaiah', 40);
    await flush();
    params = new URL(urls.at(-1), 'http://example.test').searchParams;
    assert.equal(params.get('chapter_book'), 'Isaiah');
    assert.equal(params.get('chapter'), '40');
    assert.equal(params.get('verse'), null);

    live.setVerse(3);
    await flush();
    params = new URL(urls.at(-1), 'http://example.test').searchParams;
    assert.equal(params.get('verse'), '3');

    await flush();
    live.toggleCurrentParshah();
    await flush();
    params = new URL(urls.at(-1), 'http://example.test').searchParams;
    assert.equal(live.bookOrder.value, 0);
    assert.equal(live.parshaId.value, '');
    assert.equal(live.chapter.value, 0);
    assert.equal(live.verse.value, 0);
    assert.equal(params.get('parsha'), 'current');
    assert.equal(params.get('parsha_id'), null);
  } finally {
    live.stop();
  }
});

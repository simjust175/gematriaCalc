import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll } from '../src/composables/useGematria.js';
import { createTanachCursor, normalizeTanachSelection, tanachRangeText } from '../src/composables/useTanachCursor.js';
import { TANACH_PARSHIOT } from '../server/tanachParshiot.js';
import { getCurrentWeeklyParshah, isIsraelParshahSchedule } from '../server/tanachWeeklyParsha.js';
import { isVerseInParshah } from '../server/tanachGematriaDiscovery.js';

const GENESIS_1_1 = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';

test('Genesis 1:1 cursor preserves display text and counts only Hebrew letters', () => {
  const cursor = createTanachCursor(GENESIS_1_1);
  assert.equal(cursor.displayText, GENESIS_1_1);
  assert.equal(cursor.count, 28);
  assert.equal(cursor.letters[0].character, 'ב');
  assert.equal(cursor.letters[0].value, 2);
  assert.equal(cursor.range(0, 27).gematria, 2701);
  assert.equal(computeAll(cursor.range(0, 27).text).fullGematria, 2701);
});

test('prefix-sum ranges match the Genesis 1:1 acceptance values', () => {
  const cursor = createTanachCursor(GENESIS_1_1);
  assert.equal(cursor.range(0, 5).gematria, 913);
  assert.equal(cursor.range(0, 8).gematria, 1116);
  assert.equal(computeAll(cursor.range(0, 5).text).normalizedText, 'בראשית');
  assert.equal(computeAll(cursor.range(0, 8).text).normalizedText, 'בראשית ברא');
});

test('cursor navigation indices skip punctuation, whitespace, niqqud, and cantillation', () => {
  const cursor = createTanachCursor('בְּ רֵ֖א־שִׁית׃');
  assert.deepEqual(cursor.letters.map(letter => letter.character), [...'בראשית']);
  assert.equal(cursor.tokens.filter(token => token.letterIndex != null).length, 6);
  assert.equal(cursor.letterAtDisplayIndex(0), 0);
  assert.equal(tanachRangeText('בְּ רֵ֖א־שִׁית׃', 1, 3).replace(/[\u0591-\u05C7]/g, ''), 'רֵא־ש'.replace(/[\u0591-\u05C7]/g, ''));
});

test('cursor assigns canonical separator-delimited terms distinct word indexes while preserving display text', () => {
  const separators = [' ', '־', '-', '‑', '–'];
  for (const separator of separators) {
    const text = `בית${separator}אל`;
    const cursor = createTanachCursor(text);
    assert.equal(cursor.displayText, text);
    assert.deepEqual(cursor.letters.map(letter => letter.wordIndex), [0, 0, 0, 1, 1]);
    assert.equal(cursor.range(0, 4).text, text);
  }
});

test('range order is normalized and indices are clamped', () => {
  const cursor = createTanachCursor('אבג');
  assert.equal(cursor.range(2, 0).text, 'אבג');
  assert.equal(cursor.range(-10, 99).gematria, 6);
});

test('drag-style anchor and focus selection expands and contracts in either direction', () => {
  assert.deepEqual(normalizeTanachSelection(0, 8), { start: 0, end: 8 });
  assert.deepEqual(normalizeTanachSelection(8, 2), { start: 2, end: 8 });
  assert.deepEqual(normalizeTanachSelection(8, 5), { start: 5, end: 8 });
  const cursor = createTanachCursor(GENESIS_1_1);
  assert.equal(cursor.range(0, 8).gematria, 1116);
  assert.equal(cursor.range(0, 5).gematria, 913);
});

test('visual selection includes whitespace between selected Hebrew graphemes only', () => {
  const cursor = createTanachCursor('בְּ רָא');
  const space = cursor.tokens.find(token => token.text === ' ');
  assert.equal(space.previousLetterIndex, 0);
  assert.equal(space.nextLetterIndex, 1);
});

test('canonical Torah portion metadata contains 54 individually ordered portions', () => {
  assert.equal(TANACH_PARSHIOT.length, 54);
  assert.deepEqual(TANACH_PARSHIOT.map(parsha => parsha.canonicalOrder), Array.from({ length: 54 }, (_, index) => index + 1));
  assert.deepEqual(
    TANACH_PARSHIOT.slice(0, 3).map(parsha => parsha.nameHe),
    ['בראשית', 'נח', 'לך לך']
  );
  assert.deepEqual(
    TANACH_PARSHIOT.slice(-3).map(parsha => parsha.nameHe),
    ['וילך', 'האזינו', 'וזאת הברכה']
  );
  assert.deepEqual(TANACH_PARSHIOT.find(parsha => parsha.id === 'lech-lecha').start, {
    bookSlug: 'Genesis', chapter: 12, verse: 1,
  });
  assert.deepEqual(
    TANACH_PARSHIOT.filter(parsha => parsha.start.bookSlug === 'Genesis').map(parsha => parsha.nameHe),
    ['בראשית', 'נח', 'לך לך', 'וירא', 'חיי שרה', 'תולדות', 'ויצא', 'וישלח', 'וישב', 'מקץ', 'ויגש', 'ויחי']
  );
});

test('manual Vayetze range includes its canonical endpoints and excludes neighboring verses', () => {
  const vayetze = TANACH_PARSHIOT.find(parsha => parsha.id === 'vayetze');
  const manualRange = { portions: [vayetze] };
  assert.equal(isVerseInParshah({ book_slug: 'Genesis', chapter: 28, verse: 10 }, manualRange), true);
  assert.equal(isVerseInParshah({ book_slug: 'Genesis', chapter: 32, verse: 3 }, manualRange), true);
  assert.equal(isVerseInParshah({ book_slug: 'Genesis', chapter: 28, verse: 9 }, manualRange), false);
  assert.equal(isVerseInParshah({ book_slug: 'Genesis', chapter: 32, verse: 4 }, manualRange), false);
});

test('weekly parashah resolver uses Israel by default and returns both parts of a double portion', () => {
  const weekly = getCurrentWeeklyParshah({
    date: new Date('2024-07-28T12:00:00Z'),
    isIsrael: true,
  });
  assert.equal(isIsraelParshahSchedule(), true);
  assert.deepEqual(weekly.ids, ['matot', 'masei']);
  assert.equal(weekly.nameHe, 'מטות–מסעי');
  assert.equal(weekly.shabbatDate, '2024-08-03');
});

test('weekly parashah ranges include their exact boundaries and exclude adjacent verses', () => {
  const weekly = getCurrentWeeklyParshah({
    date: new Date('2024-07-28T12:00:00Z'),
    isIsrael: true,
  });
  assert.equal(isVerseInParshah({ book_slug: 'Numbers', chapter: 30, verse: 2 }, weekly), true);
  assert.equal(isVerseInParshah({ book_slug: 'Numbers', chapter: 36, verse: 13 }, weekly), true);
  assert.equal(isVerseInParshah({ book_slug: 'Numbers', chapter: 30, verse: 1 }, weekly), false);
  assert.equal(isVerseInParshah({ book_slug: 'Deuteronomy', chapter: 1, verse: 1 }, weekly), false);
});

test('weekly parashah resolver supports divergent Israel and Diaspora schedules', () => {
  const date = new Date('2026-05-17T12:00:00Z');
  const israel = getCurrentWeeklyParshah({ date, isIsrael: true });
  const diaspora = getCurrentWeeklyParshah({ date, isIsrael: false });
  assert.equal(israel.id, 'naso');
  assert.equal(diaspora, null, 'Diaspora schedule has a festival Shabbat on this date');
});
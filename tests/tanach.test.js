import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll } from '../src/composables/useGematria.js';
import { createTanachCursor, normalizeTanachSelection, tanachRangeText } from '../src/composables/useTanachCursor.js';
import { TANACH_PARSHIOT } from '../server/tanachParshiot.js';

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
});
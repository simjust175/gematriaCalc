/**
 * tests/tanach-gematria-search.test.js
 *
 * Unit tests for the pure Tanach gematria range engine.
 * Tests cover: whole_word, whole_phrase, partial (intra-word and cross-word),
 * overlapping matches, pointed text, exact text/index extraction, stable order,
 * and no-verse-crossing guarantees.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findGematriaRanges,
  findWordEdgeRanges,
  classifyRange,
  findRangesByClassification,
} from '../server/tanachGematriaSearch.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { LETTER_VALUES } from '../src/composables/useGematria.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip niqqud/te'amim so we can compare bare Hebrew letters */
const strip = text => text.replace(/[\u0591-\u05C7]/g, '');

// ─── LETTER_VALUES sanity check ───────────────────────────────────────────────

test('LETTER_VALUES has expected values for a sample of letters', () => {
  assert.equal(LETTER_VALUES['א'], 1);
  assert.equal(LETTER_VALUES['ב'], 2);
  assert.equal(LETTER_VALUES['ג'], 3);
  assert.equal(LETTER_VALUES['י'], 10);
  assert.equal(LETTER_VALUES['ק'], 100);
  assert.equal(LETTER_VALUES['ת'], 400);
});

// ─── classifyRange ────────────────────────────────────────────────────────────

test('classifyRange: whole_word when range equals an entire single word', () => {
  // "אבג" is one word (letters 0-2)
  const { letters } = createTanachCursor('אבג');
  assert.equal(classifyRange(letters, 0, 2), 'whole_word');
});

test('classifyRange: partial when range is a prefix of a word', () => {
  // "אבג" — range(0,1) = "אב", missing last letter
  const { letters } = createTanachCursor('אבג');
  assert.equal(classifyRange(letters, 0, 1), 'partial');
});

test('classifyRange: partial when range is a suffix of a word', () => {
  // "אבג" — range(1,2) = "בג", missing first letter
  const { letters } = createTanachCursor('אבג');
  assert.equal(classifyRange(letters, 1, 2), 'partial');
});

test('classifyRange: whole_phrase when range spans multiple complete words', () => {
  // "אב גד" — letters 0-1 (word 0), 2-3 (word 1)
  const { letters } = createTanachCursor('אב גד');
  assert.equal(classifyRange(letters, 0, 3), 'whole_phrase');
});

test('classifyRange: partial for cross-word range not aligned to word boundaries', () => {
  // "אב גד" — range(1,2) = ב+ג crosses word boundary but neither end is a word boundary start
  const { letters } = createTanachCursor('אב גד');
  assert.equal(classifyRange(letters, 1, 2), 'partial');
});

test('classifyRange: single-letter word is classified whole_word', () => {
  // "א ב" — two single-letter words; range(0,0) = word 0 entirely
  const { letters } = createTanachCursor('א ב');
  assert.equal(classifyRange(letters, 0, 0), 'whole_word');
  assert.equal(classifyRange(letters, 1, 1), 'whole_word');
});

test('classifyRange: partial for cross-word range that ends at word boundary but starts mid-word', () => {
  // "אבג דה" — range(1,4) starts mid-word-0 but ends at end-of-word-1
  const { letters } = createTanachCursor('אבג דה');
  // word0: 0-2, word1: 3-4
  assert.equal(classifyRange(letters, 1, 4), 'partial');
});

// ─── findGematriaRanges: whole_word ──────────────────────────────────────────

test('findGematriaRanges: finds whole_word match for single-word verse', () => {
  // "אבג" = 1+2+3 = 6
  const results = findGematriaRanges('אבג', 6);
  assert.equal(results.length, 1);
  const [m] = results;
  assert.equal(m.start, 0);
  assert.equal(m.end, 2);
  assert.equal(m.gematria, 6);
  assert.equal(m.classification, 'whole_word');
  assert.equal(m.text, 'אבג');
});

test('findGematriaRanges: finds whole_word when target equals first word of multi-word verse', () => {
  // "בראשית ברא" — בראשית = 2+200+1+300+10+400 = 913
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א';
  const results = findGematriaRanges(verse, 913);
  const wholeWords = results.filter(r => r.classification === 'whole_word');
  assert.ok(wholeWords.length >= 1, 'should have at least one whole_word match');
  const breshit = wholeWords.find(r => r.start === 0 && r.end === 5);
  assert.ok(breshit, 'first word בראשית(0..5) should be a whole_word match');
  assert.equal(breshit.gematria, 913);
  assert.equal(strip(breshit.text), 'בראשית');
});

test('findGematriaRanges: finds whole_word for second word in verse', () => {
  // "אב גד" — ג(3)+ד(4) = 7, word index 1
  const results = findGematriaRanges('אב גד', 7);
  const ww = results.filter(r => r.classification === 'whole_word');
  assert.equal(ww.length, 1);
  assert.equal(ww[0].start, 2);
  assert.equal(ww[0].end, 3);
  assert.equal(ww[0].gematria, 7);
  assert.equal(ww[0].text, 'גד');
});

// ─── findGematriaRanges: whole_phrase ────────────────────────────────────────

test('findGematriaRanges: finds whole_phrase spanning two complete words', () => {
  // "אב גד" = 1+2+3+4 = 10
  const results = findGematriaRanges('אב גד', 10);
  const phrases = results.filter(r => r.classification === 'whole_phrase');
  assert.equal(phrases.length, 1);
  assert.equal(phrases[0].start, 0);
  assert.equal(phrases[0].end, 3);
  assert.equal(phrases[0].gematria, 10);
  assert.equal(phrases[0].text, 'אב גד');
});

test('findGematriaRanges: whole_phrase includes space in extracted text', () => {
  // "א ב" — both single-letter words, total = 1+2 = 3
  const results = findGematriaRanges('א ב', 3);
  const phrases = results.filter(r => r.classification === 'whole_phrase');
  assert.equal(phrases.length, 1);
  assert.equal(phrases[0].text, 'א ב');
  assert.equal(phrases[0].gematria, 3);
});

test('findGematriaRanges: whole_phrase for Genesis 1:1 full verse', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
  const results = findGematriaRanges(verse, 2701);
  const phrases = results.filter(r => r.classification === 'whole_phrase');
  assert.equal(phrases.length, 1);
  assert.equal(phrases[0].start, 0);
  assert.equal(phrases[0].end, 27);
  assert.equal(phrases[0].gematria, 2701);
});

// ─── findGematriaRanges: partial ─────────────────────────────────────────────

test('findGematriaRanges: finds partial match within a word', () => {
  // "אבג" target=3 → "אב"(0..1)=3 partial, "ג"(2..2)=3 partial
  const results = findGematriaRanges('אבג', 3);
  assert.ok(results.length >= 1);
  const intra = results.find(r => r.start === 0 && r.end === 1);
  assert.ok(intra, 'אב(0..1) should be found');
  assert.equal(intra.classification, 'partial');
  assert.equal(intra.gematria, 3);
  assert.equal(intra.text, 'אב');
});

test('findGematriaRanges: finds partial for suffix range within a word', () => {
  // "אבג" target=5 → "בג"(1..2)=5 partial
  const results = findGematriaRanges('אבג', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].start, 1);
  assert.equal(results[0].end, 2);
  assert.equal(results[0].classification, 'partial');
  assert.equal(results[0].text, 'בג');
});

test('findGematriaRanges: cross-word partial (not word-boundary-aligned)', () => {
  // "אב גד" target=5 → "ב ג"(1..2)=2+3=5, crosses word boundary
  const results = findGematriaRanges('אב גד', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].start, 1);
  assert.equal(results[0].end, 2);
  assert.equal(results[0].classification, 'partial');
  // text includes the space between words
  assert.equal(results[0].text, 'ב ג');
});

// ─── findGematriaRanges: overlapping matches ──────────────────────────────────

test('findGematriaRanges: finds overlapping matches', () => {
  // "אאא" — each א=1; target=1 → three separate single-letter matches
  const results = findGematriaRanges('אאא', 1);
  assert.equal(results.length, 3);
  assert.equal(results[0].start, 0);
  assert.equal(results[0].end, 0);
  assert.equal(results[1].start, 1);
  assert.equal(results[1].end, 1);
  assert.equal(results[2].start, 2);
  assert.equal(results[2].end, 2);
});

test('findGematriaRanges: overlapping multi-letter windows', () => {
  // "אבא" — א=1,ב=2,א=1
  // target=3: אב(0..1)=3, בא(1..2)=3 — two overlapping matches
  const results = findGematriaRanges('אבא', 3);
  assert.equal(results.length, 2);
  assert.equal(results[0].start, 0);
  assert.equal(results[0].end, 1);
  assert.equal(results[1].start, 1);
  assert.equal(results[1].end, 2);
  for (const r of results) assert.equal(r.gematria, 3);
});

test('findGematriaRanges: no duplicate ranges', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
  const results = findGematriaRanges(verse, 913);
  const keys = results.map(r => `${r.start}:${r.end}`);
  const unique = new Set(keys);
  assert.equal(unique.size, results.length, 'no duplicate start:end pairs');
});

// ─── Pointed text (niqqud / te'amim) ─────────────────────────────────────────

test('findGematriaRanges: pointed text returns correct gematria ignoring niqqud', () => {
  // "בְּרֵאשִׁ֖ית" with full niqqud = ב+ר+א+ש+י+ת = 2+200+1+300+10+400 = 913
  const results = findGematriaRanges('בְּרֵאשִׁ֖ית', 913);
  assert.equal(results.length, 1);
  assert.equal(results[0].gematria, 913);
  assert.equal(results[0].start, 0);
  assert.equal(results[0].end, 5);
});

test('findGematriaRanges: pointed text preserves niqqud in extracted text', () => {
  const pointed = 'בְּרֵאשִׁ֖ית';
  const results = findGematriaRanges(pointed, 913);
  assert.equal(results.length, 1);
  // The text field should include the diacritics (not stripped)
  assert.equal(results[0].text, pointed);
  // Stripping should give plain letters
  assert.equal(strip(results[0].text), 'בראשית');
});

test('findGematriaRanges: pointed multi-word text with partial match preserves pointing', () => {
  // "בְּרֵאשִׁ֖ית בָּרָ֣א" — target for "ברא" (word 1) = 2+200+1 = 203
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א';
  const results = findGematriaRanges(verse, 203);
  const wholeWord = results.find(r => r.classification === 'whole_word');
  assert.ok(wholeWord, 'ברא should be found as whole_word');
  assert.equal(wholeWord.gematria, 203);
  assert.equal(strip(wholeWord.text), 'ברא');
  // Niqqud should be present in text
  assert.notEqual(wholeWord.text, strip(wholeWord.text));
});

// ─── Exact index extraction ───────────────────────────────────────────────────

test('findGematriaRanges: start and end are inclusive letter indexes', () => {
  const cursor = createTanachCursor('אבגדה');
  // בגד = 2+3+4 = 9, letters 1..3
  const results = findGematriaRanges('אבגדה', 9);
  assert.ok(results.length >= 1);
  const match = results.find(r => r.start === 1 && r.end === 3);
  assert.ok(match, 'should find range 1..3');
  assert.equal(match.gematria, 9);
  assert.equal(match.text, 'בגד');
  // Verify with cursor.range
  const rangeText = cursor.range(1, 3).text;
  assert.equal(match.text, rangeText);
  assert.equal(cursor.range(1, 3).gematria, 9);
});

test('findGematriaRanges: extracted text matches cursor.range text exactly', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
  const cursor = createTanachCursor(verse);
  const results = findGematriaRanges(verse, 913);
  const firstWord = results.find(r => r.start === 0 && r.end === 5);
  assert.ok(firstWord);
  // cursor.range should give identical text
  assert.equal(firstWord.text, cursor.range(0, 5).text);
});

test('findGematriaRanges: letters array in result has correct characters', () => {
  const results = findGematriaRanges('אבג', 3);
  const match = results.find(r => r.start === 0 && r.end === 1);
  assert.ok(match);
  assert.equal(match.letters.length, 2);
  assert.equal(match.letters[0].character, 'א');
  assert.equal(match.letters[1].character, 'ב');
});

// ─── Stable deterministic order ──────────────────────────────────────────────

test('findGematriaRanges: results are sorted by start then end', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
  const results = findGematriaRanges(verse, 913);
  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1];
    const curr = results[i];
    if (prev.start === curr.start) {
      assert.ok(prev.end <= curr.end, `end should be non-decreasing when start equal: ${prev.end} <= ${curr.end}`);
    } else {
      assert.ok(prev.start < curr.start, `start should be increasing: ${prev.start} < ${curr.start}`);
    }
  }
});

test('findGematriaRanges: repeated calls produce identical results (deterministic)', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
  const r1 = findGematriaRanges(verse, 913);
  const r2 = findGematriaRanges(verse, 913);
  assert.deepEqual(
    r1.map(r => ({ start: r.start, end: r.end, gematria: r.gematria })),
    r2.map(r => ({ start: r.start, end: r.end, gematria: r.gematria })),
  );
});

// ─── Edge cases / boundary conditions ────────────────────────────────────────

test('findGematriaRanges: empty string returns empty array', () => {
  assert.deepEqual(findGematriaRanges('', 5), []);
});

test('findGematriaRanges: non-positive target returns empty array', () => {
  assert.deepEqual(findGematriaRanges('אבג', 0), []);
  assert.deepEqual(findGematriaRanges('אבג', -1), []);
});

test('findGematriaRanges: target larger than verse total returns empty array', () => {
  // "אב" = 1+2 = 3; target=9999 impossible
  assert.deepEqual(findGematriaRanges('אב', 9999), []);
});

test('findGematriaRanges: verse with only non-Hebrew characters returns empty array', () => {
  assert.deepEqual(findGematriaRanges('hello world 123', 5), []);
});

test('findGematriaRanges: no cross-verse results (single verse only)', () => {
  // Engine operates on one verse at a time; just confirm results
  // start and end are always within the same verse (0..count-1)
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א';
  const cursor = createTanachCursor(verse);
  const results = findGematriaRanges(verse, 913);
  for (const r of results) {
    assert.ok(r.start >= 0, 'start >= 0');
    assert.ok(r.end < cursor.count, `end(${r.end}) < count(${cursor.count})`);
    assert.ok(r.start <= r.end, 'start <= end');
  }
});

// ─── findRangesByClassification ───────────────────────────────────────────────

test('findRangesByClassification: filters to only whole_word results', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א';
  const ww = findRangesByClassification(verse, 913, 'whole_word');
  assert.ok(ww.every(r => r.classification === 'whole_word'));
  assert.ok(ww.length >= 1);
  assert.ok(ww.some(r => strip(r.text) === 'בראשית'));
});

test('findRangesByClassification: filters to only partial results', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א';
  const partials = findRangesByClassification(verse, 913, 'partial');
  assert.ok(partials.every(r => r.classification === 'partial'));
});

test('findRangesByClassification: returns empty array when no matches of that class exist', () => {
  // "אב" total=3, only one range possible; it's whole_word, so partial should be empty
  const partials = findRangesByClassification('אב', 3, 'partial');
  assert.deepEqual(partials, []);
});

// ─── Genesis 1:1 acceptance values ───────────────────────────────────────────

test('Genesis 1:1 first word (בראשית=913) is found as whole_word at letters 0..5', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
  const results = findGematriaRanges(verse, 913);
  const match = results.find(r => r.start === 0 && r.end === 5);
  assert.ok(match, 'בראשית should be found');
  assert.equal(match.classification, 'whole_word');
  assert.equal(match.gematria, 913);
});

test('Genesis 1:1 first two words (בראשית ברא=1116) found as whole_phrase', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
  const results = findGematriaRanges(verse, 1116);
  const match = results.find(r => r.start === 0 && r.end === 8);
  assert.ok(match, 'בראשית ברא should be found');
  assert.equal(match.classification, 'whole_phrase');
  assert.equal(match.gematria, 1116);
  assert.equal(strip(match.text), 'בראשית ברא');
});

// ─── Initials/finals complete-word windows ───────────────────────────────────

test('findWordEdgeRanges finds exact contiguous pointed initials windows', () => {
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
  const matches = findWordEdgeRanges(verse, 'בב', 'initials', 2);
  assert.equal(matches.length, 1);
  assert.deepEqual([matches[0].start, matches[0].end], [0, 8]);
  assert.equal(matches[0].text, 'בְּרֵאשִׁ֖ית בָּרָ֣א');
  assert.equal(matches[0].classification, 'whole_phrase');
});

test('entered initials find ordered and reordered exact contiguous word windows', () => {
  const verse = 'שמע בני מוסר שב';
  const matches = findWordEdgeRanges(verse, 'שבמ', 'initials', 3);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, 'שמע בני מוסר');
  assert.deepEqual(findWordEdgeRanges('שמע מוסר בני', 'שבמ', 'initials', 3), []);
  assert.equal(findWordEdgeRanges('שמע מוסר בני', 'שבמ', 'initials', 3, true).length, 1);
  assert.deepEqual(findWordEdgeRanges('שמע בני', 'שבמ', 'initials', 3), []);
  assert.deepEqual(findWordEdgeRanges(verse, 'שבמ', 'initials', 4), []);
});

test('שבת initials match every permutation while enforcing repeated-letter counts exactly', () => {
  for (const phrase of [
    'שמע בית תורה',
    'בית תורה שמע',
    'תורה שמע בית',
    'שמע תורה בית',
    'תורה בית שמע',
    'בית שמע תורה',
  ]) {
    const matches = findWordEdgeRanges(phrase, 'שבת', 'initials', 3, true);
    assert.equal(matches.length, 1, `expected שבת to match ${phrase}`);
    assert.equal(matches[0].text, phrase);
  }
  assert.equal(findWordEdgeRanges('בית שמע שמע', 'ששב', 'initials', 3, true).length, 1);
  assert.deepEqual(findWordEdgeRanges('בית שמע שמע', 'שבת', 'initials', 3, true), []);
  assert.deepEqual(findWordEdgeRanges('שמע בית', 'שבת', 'initials', 3), []);
  assert.deepEqual(findWordEdgeRanges('שמע בית תורה אדם', 'שבת', 'initials', 4), []);
});

test('findWordEdgeRanges finds finals and normalizes final forms only for comparison', () => {
  const pointed = 'מֶלֶךְ אָמֵן';
  const normalized = findWordEdgeRanges(pointed, 'כנ', 'finals', 2);
  const finalForms = findWordEdgeRanges(pointed, 'ךן', 'finals', 2);
  assert.equal(normalized.length, 1);
  assert.deepEqual(finalForms, normalized);
  assert.equal(normalized[0].text, pointed);
  assert.deepEqual([normalized[0].start, normalized[0].end], [0, 5]);
});

test('שבת finals match ordered and reordered windows with exact multiplicities', () => {
  assert.equal(findWordEdgeRanges('איש לב אמת', 'שבת', 'finals', 3).length, 1);
  assert.deepEqual(findWordEdgeRanges('לב אמת איש', 'שבת', 'finals', 3), []);
  assert.equal(findWordEdgeRanges('לב אמת איש', 'שבת', 'finals', 3, true).length, 1);
  assert.equal(findWordEdgeRanges('לב איש איש', 'ששב', 'finals', 3, true).length, 1);
  assert.deepEqual(findWordEdgeRanges('לב איש איש', 'שבת', 'finals', 3, true), []);
});

test('findWordEdgeRanges never skips words or accepts partial or mismatched windows', () => {
  assert.deepEqual(findWordEdgeRanges('אב גד הו', 'אה', 'initials', 2), []);
  assert.deepEqual(findWordEdgeRanges('אב גד', 'אב', 'initials', 2), []);
  assert.deepEqual(findWordEdgeRanges('אב גד', 'בא', 'finals', 2), []);
  assert.deepEqual(findWordEdgeRanges('אב גד הו', 'אג', 'initials', 3), []);
});

test('one entered letter defines one word slot and finals normalize final forms', () => {
  const matches = findWordEdgeRanges('שלום חכם לב', 'מ', 'finals', 1);
  assert.deepEqual(matches.map(match => match.text), ['שלום', 'חכם']);
  assert.deepEqual(findWordEdgeRanges('שלום', 'ם', 'finals', 1), matches.slice(0, 1));
  assert.deepEqual(findWordEdgeRanges('שלום', 'ל', 'finals', 1), []);
});

test('final-form equivalence applies to finals but never to initials', () => {
  assert.deepEqual(findWordEdgeRanges('מלך', 'ם', 'initials', 1), []);
  assert.equal(findWordEdgeRanges('מלך', 'מ', 'initials', 1).length, 1);
  assert.equal(findWordEdgeRanges('שלום', 'מ', 'finals', 1).length, 1);
  assert.equal(findWordEdgeRanges('שלום', 'ם', 'finals', 1).length, 1);
});
test('findWordEdgeRanges follows canonical maqaf words while ignoring punctuation and deduplicates', () => {
  const matches = findWordEdgeRanges('אב־גד הו אב־גד הו', 'אג', 'initials', 2);
  assert.deepEqual(matches.map(match => [match.start, match.end]), [[0, 3], [6, 9]]);
  assert.equal(new Set(matches.map(match => `${match.start}:${match.end}`)).size, matches.length);
});

test('maqaf terms form a two-word window and preserve their original display separator', () => {
  const text = 'בית־אל';
  const edgeMatches = findWordEdgeRanges(text, 'בא', 'initials', 2);
  assert.equal(edgeMatches.length, 1);
  assert.equal(edgeMatches[0].text, text);
  assert.deepEqual([edgeMatches[0].start, edgeMatches[0].end], [0, 4]);

  const gematriaMatches = findGematriaRanges(text, 443);
  assert.equal(gematriaMatches.length, 1);
  assert.equal(gematriaMatches[0].classification, 'whole_phrase');
  assert.equal(gematriaMatches[0].text, text);
});

test('word windows and whole-phrase classification recognize every canonical separator', () => {
  for (const separator of [' ', '־', '-', '‑', '–']) {
    const text = `אב${separator}גד`;
    const edges = findWordEdgeRanges(text, 'אג', 'initials', 2);
    assert.equal(edges.length, 1, `expected a two-word window for ${separator}`);
    assert.equal(edges[0].text, text);
    const match = findGematriaRanges(text, 10)[0];
    assert.equal(match.classification, 'whole_phrase');
    assert.equal(match.text, text);
  }
});

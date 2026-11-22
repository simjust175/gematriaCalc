import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcGematria } from '../src/composables/useGematria.js';
import { TANACH_PARSHIOT, TORAH_BOOKS, getParshahForReference, canonicalParshaRow } from '../server/tanachParshiot.js';
import { exportTanachGematria, parseGematriaSearchQuery, searchTanachGematria } from '../server/tanachGematriaDiscovery.js';
import { verifyTanachSaveContext } from '../server/tanachSaveContext.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';

let revision = 0;
function fakeDb(corpus) {
  const stamp = `parsha-discovery-${++revision}`;
  const calls = [];
  return { calls, async query(sql) {
    calls.push(sql);
    if (sql.includes('MAX(imported_at)')) return { rows: [{ imported_at: stamp, representation_version: 2 }] };
    if (sql.includes('FROM tanach_verses v')) return { rows: corpus };
    throw new Error(`Unexpected query: ${sql}`);
  } };
}
function verse(bookSlug, chapter, number, text) {
  const book = TORAH_BOOKS.find(book => book.bookSlug === bookSlug);
  return { book_slug: bookSlug, book_name: book?.nameHe || 'יהושע',
    canonical_order: book?.canonicalOrder || 6, chapter, verse: number, display_text: text };
}
const parse = extra => {
  const options = parseGematriaSearchQuery({ value: '502', parsha_scope: 'torah', ...extra });
  assert.ok(!options.error, JSON.stringify(options));
  return options;
};
const breakdownPortions = response => response.parshaBreakdown.books.flatMap(book => book.parshiot);
const occurrenceKey = match => `${match.bookSlug}:${match.chapter}:${match.verse}:${match.start}:${match.end}`;

test('all 54 inclusive portion boundaries have one canonical owner, including Hebrew numbering transitions', () => {
  assert.equal(TANACH_PARSHIOT.length, 54);
  for (const portion of TANACH_PARSHIOT) {
    assert.equal(getParshahForReference(portion.start)?.id, portion.id);
    assert.equal(getParshahForReference(portion.end)?.id, portion.id);
  }
  for (const [bookSlug, chapter, number, expected] of [
    ['Genesis', 6, 8, 'bereshit'], ['Genesis', 6, 9, 'noach'],
    ['Genesis', 32, 3, 'vayetze'], ['Genesis', 32, 4, 'vayishlach'],
    ['Leviticus', 5, 26, 'vayikra'], ['Leviticus', 6, 1, 'tzav'],
    ['Numbers', 30, 1, 'pinchas'], ['Numbers', 30, 2, 'matot'],
    ['Exodus', 20, 23, 'yitro'], ['Exodus', 20, 24, 'yitro'],
    ['Exodus', 20, 25, 'yitro'], ['Exodus', 20, 26, 'yitro'], ['Exodus', 21, 1, 'mishpatim'],
  ]) assert.equal(getParshahForReference({ bookSlug, chapter, verse: number })?.id, expected);
  assert.equal(getParshahForReference({ bookSlug: 'Joshua', chapter: 1, verse: 1 }), null);
  assert.equal(getParshahForReference({ bookSlug: 'Genesis', chapter: 0, verse: 1 }), null);
});

test('canonical read projection corrects old Yitro metadata without mutating its stored row', async () => {
  const stored = { id: 'yitro', name_he: 'יתרו', start_book_slug: 'Exodus', start_chapter: 18,
    start_verse: 1, end_book_slug: 'Exodus', end_chapter: 20, end_verse: 23 };
  const projected = canonicalParshaRow(stored);
  assert.equal(projected.end_verse, 26);
  assert.equal(stored.end_verse, 23);
  const calls = [];
  const displayText = 'וְלֹא תַעֲלֶה';
  const originalText = createTanachCursor(displayText).range(0, 2).text;
  const db = { async query(sql) {
    calls.push(sql);
    if (sql.includes('FROM tanach_verses')) return { rowCount: 1, rows: [{ display_text: displayText, hebrew_name: 'שמות' }] };
    if (sql.includes('FROM tanach_parshiot')) return { rowCount: 1, rows: [stored] };
    throw new Error('Unexpected query');
  } };
  const context = { bookSlug: 'Exodus', chapter: 20, verse: 26, start: 0, end: 2, parshaId: 'yitro' };
  const verified = await verifyTanachSaveContext(originalText, context, db);
  assert.equal(verified.context.parshaId, 'yitro');
  assert.equal(verified.originalText, originalText);
  await assert.rejects(verifyTanachSaveContext(originalText, { ...context, parshaId: 'mishpatim' }, db),
    { code: 'INVALID_TANACH_CONTEXT' });
  await assert.rejects(verifyTanachSaveContext('טקסט שגוי', context, db), { code: 'TANACH_RANGE_MISMATCH' });
  assert.ok(calls.every(sql => sql.trimStart().startsWith('SELECT')), 'metadata validation must never update or seed rows');
});

test('ordinary Tanach pages and complete exports sort canonical books, segments and offsets before slicing', async () => {
  const samuel = (segment, chapter, number) => ({ ...verse(`Samuel${segment}`, chapter, number, 'ג'), canonical_order: 8, segment_order: segment });
  const db = fakeDb([samuel(2, 1, 1), samuel(1, 2, 1), verse('Genesis', 2, 1, 'ג'),
    samuel(1, 1, 2), samuel(1, 1, 1), verse('Genesis', 1, 1, 'ג ג')]);
  const query = { value: '3', limit: '2' };
  const pages = [];
  for (let page = 1; page <= 4; page += 1) pages.push(...(await searchTanachGematria(db,
    parseGematriaSearchQuery({ ...query, page: String(page) }))).results);
  assert.deepEqual(pages.map(occurrenceKey), [
    'Genesis:1:1:0:0', 'Genesis:1:1:1:1', 'Genesis:2:1:0:0',
    'Samuel1:1:1:0:0', 'Samuel1:1:2:0:0', 'Samuel1:2:1:0:0', 'Samuel2:1:1:0:0',
  ]);
  const exported = await exportTanachGematria(db, parseGematriaSearchQuery(query));
  assert.deepEqual(exported.results, pages);
});

test('502 breakdown counts every Torah occurrence before paging and retains all 54 portions including zeros', async () => {
  const db = fakeDb([
    verse('Deuteronomy', 33, 1, 'תקב'), verse('Genesis', 6, 9, 'תקב'),
    verse('Joshua', 1, 1, 'תקב'), verse('Exodus', 1, 1, 'תקב'),
    verse('Genesis', 6, 8, 'תקב תקב'), verse('Leviticus', 1, 1, 'תקב'),
    verse('Genesis', 1, 1, Array(20).fill('תַּקב').join(' ')), verse('Numbers', 1, 1, 'תקב'),
  ]);
  const first = await searchTanachGematria(db, parse({ limit: '12' }));
  assert.equal(first.results.length, 12);
  assert.equal(first.total, 27);
  assert.equal(first.parshaBreakdown.total, 27);
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.parshaBreakdown.books.map(book => book.bookSlug), TORAH_BOOKS.map(book => book.bookSlug));
  assert.deepEqual(first.parshaBreakdown.books.map(book => book.parshiot.length), [12, 11, 10, 10, 11]);
  const portions = breakdownPortions(first);
  assert.equal(portions.length, 54);
  assert.deepEqual(portions.map(portion => portion.canonicalOrder), Array.from({ length: 54 }, (_, index) => index + 1));
  assert.equal(portions.find(portion => portion.id === 'bereshit').total, 22);
  assert.equal(portions.find(portion => portion.id === 'noach').total, 1);
  assert.equal(portions.find(portion => portion.id === 'lech-lecha').total, 0);
  assert.equal(portions.reduce((total, portion) => total + portion.total, 0), first.total);
  const second = await searchTanachGematria(db, parse({ page: '2', limit: '12' }));
  const third = await searchTanachGematria(db, parse({ page: '3', limit: '12' }));
  const complete = [...first.results, ...second.results, ...third.results];
  assert.equal(complete.length, 27);
  assert.equal(new Set(complete.map(occurrenceKey)).size, 27);
  assert.ok(complete.every(match => match.bookSlug !== 'Joshua' && match.gematria === 502));
  assert.ok(complete.every(match => match.parshaId && match.parshaName && match.parshaSequence && match.bookOrder));
  assert.ok(complete[0].text.includes('ּ'));
  const sorted = [...complete].sort((a, b) => a.bookOrder - b.bookOrder || a.chapter - b.chapter
    || a.verse - b.verse || a.start - b.start || a.end - b.end);
  assert.deepEqual(complete.map(occurrenceKey), sorted.map(occurrenceKey));
  const selected = await searchTanachGematria(db, parse({ parsha_id: 'noach' }));
  assert.equal(selected.total, 1);
  assert.equal(selected.results[0].parshaId, 'noach');
  assert.equal(selected.results[0].verse, 9);
  assert.deepEqual(selected.parshaBreakdown, first.parshaBreakdown);
  const exported = await exportTanachGematria(db, parse({ page: '3', limit: '1' }));
  assert.deepEqual(exported.results, complete);
  assert.equal(exported.hasMore, false);
  assert.equal(exported.results.length, exported.total);
  assert.equal(db.calls.filter(sql => sql.includes('FROM tanach_verses v')).length, 1,
    'summary, selection, paging and export reuse one corpus load, never 54 separate portion queries');
});

test('Parsha counts and export preserve complete-word/partial/full-verse semantics and the effective Kollel target', async () => {
  const db = fakeDb([verse('Genesis', 1, 1, 'אבג'), verse('Genesis', 6, 9, 'ג'),
    verse('Exodus', 1, 1, 'א ב'), verse('Joshua', 1, 1, 'ג')]);
  const all = await searchTanachGematria(db, parse({ value: '3' }));
  assert.equal(all.total, 2);
  assert.ok(all.results.every(match => match.type !== 'partial'));
  const partial = await exportTanachGematria(db, parse({ value: '3', type: 'partial' }));
  assert.equal(partial.total, 2);
  assert.equal(partial.parshaBreakdown.total, 2);
  assert.ok(partial.results.every(match => match.type === 'partial' && match.parshaId === 'bereshit'));
  const wholeVerse = await exportTanachGematria(db, parse({ value: '3', type: 'whole_verse' }));
  assert.equal(wholeVerse.total, 2);
  assert.ok(wholeVerse.results.every(match => calcGematria(match.text) === 3));
  // The existing client applies Kollel once, sending the effective target 2+1.
  assert.equal(wholeVerse.target, 3);
  const legacy = await searchTanachGematria(db, parseGematriaSearchQuery({ value: '3' }));
  assert.equal(legacy.total, 3, 'ordinary Tanach discovery still includes Neviim/Ketuvim');
  assert.ok(legacy.results.some(match => match.bookSlug === 'Joshua'));
  assert.equal(legacy.parshaBreakdown, undefined);
});

test('initial/final letter modes and textual search use the same global Parsha aggregation', async () => {
  const db = fakeDb([verse('Genesis', 6, 8, 'אָב בָּג'), verse('Genesis', 6, 9, 'בָּג אָב'),
    verse('Exodus', 1, 1, 'אָב בָּג'), verse('Joshua', 1, 1, 'אָב בָּג')]);
  const initials = await searchTanachGematria(db, parse({ value: undefined, method: 'initials', sequence: 'אב' }));
  assert.equal(initials.total, 2);
  const reordered = await exportTanachGematria(db, parse({ value: undefined, method: 'initials', sequence: 'אב', order_independent: 'true' }));
  assert.equal(reordered.total, 3);
  assert.equal(breakdownPortions(reordered).find(portion => portion.id === 'noach').total, 1);
  const finals = await exportTanachGematria(db, parse({ value: undefined, method: 'finals', sequence: 'בג' }));
  assert.equal(finals.total, 2);
  const searched = await searchTanachGematria(db, parse({ value: undefined, method: 'initials', sequence: 'אב', search: 'בראשית' }));
  assert.equal(searched.total, 1);
  assert.equal(searched.parshaBreakdown.books.find(book => book.bookSlug === 'Exodus').total, 0);
});

test('Torah Parsha scope is explicit and cannot silently mix legacy weekly/book/chapter scopes', () => {
  assert.equal(parse({}).parshaScope, true);
  for (const extra of [{ parsha_scope: 'all' }, { parsha_scope: ['torah'] }, { parsha: 'current' },
    { book_order: '1' }, { chumash: 'Genesis' }, { chapter_book: 'Genesis', chapter: '1' }]) {
    assert.ok(parseGematriaSearchQuery({ value: '502', parsha_scope: 'torah', ...extra }).error);
  }
  assert.equal(parse({ parsha_id: 'bereshit' }).parshaId, 'bereshit');
  assert.equal(parseGematriaSearchQuery({ value: '502', parsha: 'current' }).error, undefined);
});

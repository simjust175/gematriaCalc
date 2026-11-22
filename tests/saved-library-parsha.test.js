import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateSavedRelationships, parseSavedMatchQuery } from '../server/savedLibrary.js';

const row = (id, book, chapter, verse, start = 0, extra = {}) => ({
  id, source_type: 'tanach', parent_id: 100,
  original_text: 'אֶחָד', parent_original_text: 'אהבה', parent_gematria: 13,
  reason_codes: ['full_gematria'], created_at: new Date(2026, 0, id).toISOString(),
  tanach_book_slug: book, tanach_book_label: book, tanach_chapter: chapter,
  tanach_verse: verse, tanach_start: start, tanach_end: start + 2,
  parent_parsha_id: 'noach', ...extra,
});

test('saved Parsha filters use child source coordinates and retain global tab counts', () => {
  const rows = [row(1, 'Genesis', 6, 8), row(2, 'Genesis', 6, 9), row(3, 'Isaiah', 1, 1),
    row(4, null, null, null, 0, { source_type: 'tefillot', tefillot_unit_id: 4, tefillot_start: 0, tefillot_end: 2 })];
  const all = paginateSavedRelationships(rows, parseSavedMatchQuery({}), 12);
  assert.equal(all.total, 4);
  const filtered = paginateSavedRelationships(rows, parseSavedMatchQuery({ parsha_id: 'bereshit', search: '13', matchType: 'full_gematria' }), 12);
  assert.deepEqual(filtered.matches.map(item => item.id), [1]);
  assert.equal(filtered.matches[0].parshaId, 'bereshit');
  assert.deepEqual(filtered.counts, { matches: 4, entries: 12 });
  assert.equal(paginateSavedRelationships(rows, parseSavedMatchQuery({ parsha_id: 'noach' }), 12).matches[0].id, 2);
  assert.equal(paginateSavedRelationships(rows, parseSavedMatchQuery({ parsha_id: 'bereshit', source: 'tefillot' }), 12).total, 0);
});

test('selected saved Parsha sorts canonical occurrences before every page, independently of save dates', () => {
  const rows = [row(1, 'Genesis', 3, 2, 8), row(2, 'Genesis', 1, 1, 9), row(3, 'Genesis', 1, 1, 0), row(4, 'Genesis', 2, 1, 0)];
  const first = paginateSavedRelationships(rows, parseSavedMatchQuery({ parsha_id: 'bereshit', limit: 2 }), 1);
  const second = paginateSavedRelationships(rows, parseSavedMatchQuery({ parsha_id: 'bereshit', limit: 2, offset: 2, sort: 'gematria' }), 1);
  assert.deepEqual([...first.matches, ...second.matches].map(item => item.id), [3, 2, 4, 1]);
  assert.equal(second.pagination.hasMore, false);
  const focused = paginateSavedRelationships(rows, parseSavedMatchQuery({ parsha_id: 'bereshit', limit: 1, focus: 'tanach:1' }), 1);
  assert.equal(focused.focusedKey, 'tanach:1');
  assert.equal(focused.pagination.offset, 3);
});

test('saved Parsha query rejects unrecognized or ambiguous identifiers', () => {
  for (const parsha_id of ['not-a-portion', ['bereshit'], {}, 5]) assert.equal(parseSavedMatchQuery({ parsha_id }).error, 'invalid_parsha_filter');
});

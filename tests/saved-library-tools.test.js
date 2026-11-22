import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { parseSavedMatchQuery as parse, paginateSavedRelationships as page } from '../server/savedLibrary.js';
import { getCurrentWeeklyParshah } from '../server/tanachWeeklyParsha.js';
import { buildSavedLibraryReportHtml, registerSavedLibraryPdfRoutes } from '../server/savedLibraryPdf.js';

const row = (id, book, chapter, verse, start = 0) => ({
  id, parent_id: id + 100, source_type: 'tanach', original_text: 'אֶחָד',
  parent_original_text: 'אהבה', parent_gematria: 13, reason_codes: ['full_gematria'],
  created_at: new Date(2026, 0, id).toISOString(), tanach_book_slug: book,
  tanach_book_label: book === 'Genesis' ? 'בראשית' : 'במדבר', tanach_chapter: chapter,
  tanach_verse: verse, tanach_start: start, tanach_end: start + 2,
});

test('saved Torah browsing sorts canonical portions and actual offsets before pagination, excluding other sources', () => {
  const rows = [row(1, 'Numbers', 30, 2), row(2, 'Genesis', 6, 9), row(3, 'Genesis', 1, 1, 9),
    row(4, 'Genesis', 1, 1, 0), row(5, 'Isaiah', 1, 1), { ...row(6), source_type: 'tefillot' }];
  const first = page(rows, parse({ parsha_scope: 'torah', limit: 2 }), 8);
  const rest = page(rows, parse({ parsha_scope: 'torah', offset: 2, sort: 'gematria' }), 8);
  assert.deepEqual([...first.matches, ...rest.matches].map(match => match.id), [4, 3, 2, 1]);
  assert.deepEqual(first.counts, { matches: 6, entries: 8 });
  const exported = page(rows, parse({ parsha_scope: 'torah', offset: 5, limit: 1 }), 8, { exportAll: true });
  assert.deepEqual(exported.matches.map(match => match.id), [4, 3, 2, 1]);
  assert.equal(exported.pagination.hasMore, false);
});

test('weekly saved filtering supports both combined portions, inclusive boundaries, and no-reading weeks without fallback', () => {
  const weeklyParshah = getCurrentWeeklyParshah({ date: new Date('2026-07-11T12:00:00Z') });
  assert.deepEqual(weeklyParshah.ids, ['matot', 'masei']);
  const rows = [row(1, 'Numbers', 30, 1), row(2, 'Numbers', 30, 2), row(3, 'Numbers', 33, 1), row(4, 'Numbers', 36, 13), row(5, 'Deuteronomy', 1, 1)];
  const result = page(rows, parse({ parsha: 'current' }), 5, { weeklyParshah });
  assert.deepEqual(result.matches.map(match => match.id), [2, 3, 4]);
  assert.equal(page(rows, parse({ parsha: 'current' }), 5, { weeklyParshah: null }).total, 0);
});

test('weekly saved membership follows the configured Israel or Diaspora calendar', () => {
  const date = new Date('2026-05-30T12:00:00Z');
  const rows = [row(1, 'Numbers', 4, 21), row(2, 'Numbers', 8, 1)];
  const israel = getCurrentWeeklyParshah({ date, isIsrael: true });
  const diaspora = getCurrentWeeklyParshah({ date, isIsrael: false });
  assert.equal(israel.id, 'behaalotecha');
  assert.equal(diaspora.id, 'naso');
  assert.deepEqual(page(rows, parse({ parsha: 'current' }), 2, { weeklyParshah: israel }).matches.map(match => match.id), [2]);
  assert.deepEqual(page(rows, parse({ parsha: 'current' }), 2, { weeklyParshah: diaspora }).matches.map(match => match.id), [1]);
});

test('saved portion queries reject ambiguous, unrecognized and non-scalar scope controls', () => {
  for (const query of [{ parsha: 'noach' }, { parsha: ['current'] }, { parsha_scope: true },
    { parsha: 'current', parsha_id: 'noach' }, { parsha_scope: 'all' }]) {
    assert.equal(parse(query).error, 'invalid_parsha_filter');
  }
});

test('saved report preserves every persisted relationship, original expression, pointed text, references and reason', () => {
  const parsed = parse({ parsha_scope: 'torah', search: '13' });
  const data = page([row(2, 'Genesis', 6, 9), row(1, 'Genesis', 1, 1)], parsed, 2, { exportAll: true });
  data.matches[0].parentOriginalText = '<script>&אהבה';
  const html = buildSavedLibraryReportHtml({ data, parsed, fontData: 'AA==' });
  assert.ok(html.includes('2 התאמות שמורות'));
  assert.ok(html.includes('אֶחָד'));
  assert.ok(html.includes('בראשית א׳:א׳'));
  assert.ok(html.includes('&lt;script&gt;&amp;אהבה'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('ערך ההתאמה: 13'));
  assert.ok(html.indexOf('data-saved-key="tanach:1"') < html.indexOf('data-saved-key="tanach:2"'));
  const prayers = page([{ ...row(3), source_type: 'tefillot', section_label: 'ברכות',
    source_work: 'סידור', source_version: 'מהדורה', license: 'CC-BY', source_url: 'https://example.org/source' }], parse({ source: 'tefillot' }), 1);
  const prayerHtml = buildSavedLibraryReportHtml({ data: prayers, parsed: parse({ source: 'tefillot' }), fontData: 'AA==' });
  assert.ok(prayerHtml.includes('ברכות'));
  assert.ok(prayerHtml.includes('סידור · מהדורה · CC-BY · https://example.org/source'));
});

test('saved PDF endpoint exports the complete filtered persisted set, ignores page limits and rejects unauthenticated requests', async () => {
  const rows = Array.from({ length: 65 }, (_, i) => row(i + 1, 'Genesis', 1, 1, i));
  const db = { query: async sql => ({ rows: /FROM curated_matches/.test(sql) ? rows
    : /to_regclass/.test(sql) ? [{ ready: false }] : [{ count: 65 }] }) };
  let rendered;
  const app = express(); app.use(express.json());
  registerSavedLibraryPdfRoutes(app, { pool: db,
    requireAuth: (req, res, next) => req.get('x-test-auth') ? next() : res.sendStatus(401),
    renderPdf: async report => { rendered = report; return Buffer.from('%PDF-test'); },
  });
  const body = { query: { parsha_scope: 'torah', limit: 1, offset: 60, search: '13' } };
  assert.equal((await request(app).post('/api/entries/curated-matches/export.pdf').send(body)).status, 401);
  const response = await request(app).post('/api/entries/curated-matches/export.pdf').set('x-test-auth', '1').send(body);
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-result-count'], '65');
  assert.equal(response.headers['x-collection'], 'saved-matches');
  assert.equal(rendered.data.matches.length, 65);
  assert.deepEqual(rendered.data.matches.map(match => match.id), rows.map(row => row.id));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTanachReportHtml, parseTanachPdfRequest } from '../server/tanachPdf.js';
import { formatHebrewReference } from '../src/utils/hebrewReference.js';

test('PDF request preserves original numeric target, כולל and exact Hebrew method context', () => {
  const regular = parseTanachPdfRequest({ originalText: '502', query: { value: '502', parsha_scope: 'torah' } });
  assert.equal(regular.originalText, '502');
  assert.equal(regular.options.parshaScope, true);
  assert.equal(regular.includeKollel, false);
  const kollel = parseTanachPdfRequest({ originalText: '502', query: { value: '503', parsha_id: 'bereshit', parsha_scope: 'torah' } });
  assert.equal(kollel.includeKollel, true);
  assert.equal(parseTanachPdfRequest({ originalText: '502', query: { value: '504' } }).error, 'export_target_mismatch');
  const initials = parseTanachPdfRequest({ originalText: 'אבג', query: { method: 'initials', sequence: 'אבג', parsha_scope: 'torah' } });
  assert.equal(initials.options.method, 'initials');
  assert.equal(parseTanachPdfRequest({ originalText: 'אבג', query: { method: 'finals', sequence: 'בג' } }).error, 'export_sequence_mismatch');
  assert.equal(parseTanachPdfRequest({ originalText: '502', query: { value: '502', parsha_id: 'invalid' } }).error, 'invalid_parsha_filter');
});

test('PDF report includes every supplied canonical occurrence, niqqud, original expression and escaped text in the same order', () => {
  const options = parseTanachPdfRequest({ originalText: '502', query: { value: '502', parsha_scope: 'torah' } }).options;
  const results = Array.from({ length: 65 }, (_, index) => ({ bookSlug: 'Genesis', bookName: 'בראשית', chapter: index < 40 ? 1 : 6,
    verse: index < 40 ? 1 : 9, start: index, end: index + 2, text: index === 64 ? 'אֶחָד <script>' : 'אֶחָד', gematria: 13 }));
  const html = buildTanachReportHtml({ data: { results, total: 65 }, options, originalText: '502 <&>', fontData: 'AA==', attribution: 'מקור <&>' });
  assert.equal((html.match(/data-match-index=/g) || []).length, 65);
  assert.ok(html.indexOf('data-match-index="1"') < html.indexOf('data-match-index="65"'));
  assert.ok(html.includes('כל הפרשיות'));
  assert.ok(html.includes('65 התאמות'));
  assert.ok(html.includes('אֶחָד &lt;script&gt;'));
  assert.ok(html.includes('502 &lt;&amp;&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.equal((html.match(/<h2>/g) || []).length, 2);
  assert.ok(html.includes('font/ttf;base64,AA=='));
  assert.ok(html.includes('break-inside:avoid-page'));
  assert.equal(formatHebrewReference('בראשית', 12, 3), 'בראשית י״ב:ג׳');
});

test('edge-method reports distinguish the matched letters from the full phrase gematria', () => {
  const parsed = parseTanachPdfRequest({ originalText: 'אב', query: { method: 'initials', sequence: 'אב', parsha_scope: 'torah' } });
  const html = buildTanachReportHtml({ ...parsed, fontData: 'AA==', data: { results: [{ bookSlug: 'Genesis', bookName: 'בראשית', chapter: 1, verse: 1, start: 0, end: 7, text: 'אב בית', gematria: 415 }] } });
  assert.ok(html.includes('ראשי תיבות: אב · 3'));
  assert.ok(html.includes('גימטריית הטקסט: 415'));
});

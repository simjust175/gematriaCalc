import { computeAll } from '../src/composables/useGematria.js';
import { formatHebrewReference } from '../src/utils/hebrewReference.js';
import { TANACH_PARSHIOT } from './tanachParshiot.js';
import { parseSavedMatchQuery, readSavedRelationships } from './savedLibrary.js';
import { buildHebrewReportDocument, escapeReportText as escape, renderTanachPdf } from './tanachPdf.js';

const REASONS = {
  full_gematria: 'גימטריה', initials_text: 'ראשי תיבות', initials_gematria: 'גימטריית ראשי תיבות',
  finals_text: 'סופי תיבות', finals_gematria: 'גימטריית סופי תיבות', saved_word: 'מילה שמורה', milui_gematria: 'מילוי',
};
let busy = false;

export function savedReportScope(parsed, data) {
  if (parsed.currentParshah) return data.weeklyParshah
    ? `פרשת השבוע · ${data.weeklyParshah.nameHe}` : 'פרשת השבוע · אין קריאה רגילה';
  if (parsed.parshaId) return `פרשת ${TANACH_PARSHIOT.find(portion => portion.id === parsed.parshaId).nameHe}`;
  if (parsed.parshaScope) return 'כל הפרשיות';
  return parsed.source === 'tanach' ? 'תנ״ך' : parsed.source === 'tefillot' ? 'תפילות' : 'כל המקורות';
}

export function buildSavedLibraryReportHtml({ data, parsed, fontData }) {
  const scope = savedReportScope(parsed, data);
  const orderedByParsha = parsed.parshaId || parsed.parshaScope || parsed.currentParshah;
  let previousPortion;
  const rowsHtml = data.matches.map((match, index) => {
    const context = match.tanachContext;
    const prayer = match.tefillotContext;
    const reference = context
      ? formatHebrewReference(context.bookLabel || context.bookSlug, context.chapter, context.verse)
      : [prayer?.serviceLabel, prayer?.sectionLabel, prayer?.sourceReference].filter(Boolean).join(' · ');
    const heading = orderedByParsha && match.parshaId !== previousPortion
      ? `<h2>${escape(context?.bookLabel)} · פרשת ${escape(match.parshaName)}</h2>` : '';
    previousPortion = match.parshaId;
    const calculation = match.calculation || computeAll(match.originalText);
    const value = match.gematriaValue == null ? '' : ` · ערך ההתאמה: ${match.gematriaValue}`;
    return `${heading}<article class="match" data-saved-key="${escape(match.key)}" data-match-index="${index + 1}">
      <div class="reference"><bdi>${index + 1}</bdi><strong>${escape(reference)}</strong><span>${escape(match.sourceType === 'tefillot' ? 'תפילות' : 'תנ״ך')}</span></div>
      <p class="search-note">הביטוי המקורי: <bdi dir="auto">${escape(match.parentOriginalText)}</bdi></p>
      <p class="match-text">${escape(match.originalText)}</p>
      <div class="search-note">${escape(match.reasonCodes.map(reason => REASONS[reason] || 'התאמה שמורה').join(' · '))}${escape(value)} · גימטריית הטקסט: ${calculation?.fullGematria ?? '—'}</div>
      ${prayer ? `<p class="search-note">${escape([prayer.sourceWork, prayer.sourceVersion, prayer.license, prayer.sourceUrl].filter(Boolean).join(' · '))}</p>` : ''}
    </article>`;
  }).join('');
  const filters = [parsed.search ? `חיפוש: ${parsed.search}` : '',
    parsed.matchType ? `סוג התאמה: ${REASONS[parsed.matchType]}` : '',
    parsed.source === 'tanach' ? 'מקור: תנ״ך' : parsed.source === 'tefillot' ? 'מקור: תפילות' : '',
  ].filter(Boolean).map(escape).join(' · ');
  const headerHtml = `<header><div class="brand">גימטריה · הספרייה השמורה</div><h1>התאמות שמורות</h1><p class="scope">${escape(scope)}</p>
    <div class="summary"><strong>${data.total.toLocaleString('he-IL')} ${data.total === 1 ? 'התאמה שמורה' : 'התאמות שמורות'} · כל התוצאות המסוננות</strong></div>
    ${filters ? `<p class="search-note">${filters}</p>` : ''}</header>`;
  return buildHebrewReportDocument({ title: `התאמות שמורות · ${scope}`, headerHtml, rowsHtml, fontData });
}

export function registerSavedLibraryPdfRoutes(app, { pool, requireAuth, renderPdf = renderTanachPdf }) {
  app.post('/api/entries/curated-matches/export.pdf', requireAuth, async (req, res) => {
    const query = req.body?.query;
    if (!query || typeof query !== 'object' || Array.isArray(query)) return res.status(400).json({ error: 'invalid_export_request' });
    // Pagination/focus are presentation details, never limits on the report.
    const parsed = parseSavedMatchQuery({ ...query, limit: 100, offset: 0, focus: undefined });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (busy) return res.status(429).json({ error: 'pdf_busy' });
    busy = true;
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', onClose);
    try {
      const data = await readSavedRelationships(pool, parsed, { exportAll: true });
      if (data.matches.length !== data.total) throw new Error('Incomplete saved collection');
      if (data.total > 20_000) return res.status(413).json({ error: 'pdf_too_large' });
      const pdf = await renderPdf({ data, parsed }, { signal: controller.signal, buildHtml: buildSavedLibraryReportHtml });
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="gematria-saved-matches.pdf"',
        'Cache-Control': 'private, no-store', 'X-Result-Count': String(data.total), 'X-Collection': 'saved-matches' });
      res.send(pdf);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('/api/entries/curated-matches/export.pdf error:', error.message);
        if (!res.headersSent) res.status(503).json({ error: 'pdf_unavailable' });
      }
    } finally {
      busy = false;
      res.removeListener('close', onClose);
    }
  });
}

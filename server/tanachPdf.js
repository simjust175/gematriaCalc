import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, delimiter } from 'node:path';
import { chromium } from 'playwright-core';
import { computeAll, getHebrewLetterPattern } from '../src/composables/useGematria.js';
import { formatHebrewReference } from '../src/utils/hebrewReference.js';
import { TANACH_PARSHIOT, getParshahForReference } from './tanachParshiot.js';
import {
  parseGematriaSearchQuery, validateTanachGematriaScope, exportTanachGematria,
} from './tanachGematriaDiscovery.js';

const MAX_REPORT_RESULTS = 20_000;
const MAX_ORIGINAL_LENGTH = 10_000;
const METHOD_LABELS = { gematria: 'גימטריה', initials: 'ראשי תיבות', finals: 'סופי תיבות' };
const TYPE_LABELS = { all: 'כל ההתאמות השלמות', whole_word: 'מילה שלמה', whole_phrase: 'צירוף מילים', whole_verse: 'פסוק שלם', partial: 'חלק ממילה' };
let fontPromise;
let busy = false;

export function escapeReportText(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function parseTanachPdfRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || typeof body.originalText !== 'string' || !body.originalText.trim()
      || body.originalText.length > MAX_ORIGINAL_LENGTH
      || !body.query || typeof body.query !== 'object' || Array.isArray(body.query)) {
    return { error: 'invalid_export_request' };
  }
  const query = { ...body.query, page: 1, limit: 50 };
  const options = parseGematriaSearchQuery(query);
  if (options.error) return options;
  const originalText = body.originalText.trim();
  const calculation = computeAll(originalText);
  if (!calculation) return { error: 'invalid_export_expression' };
  if (options.method === 'gematria') {
    if (options.value !== calculation.fullGematria && options.value !== calculation.fullGematria + 1) {
      return { error: 'export_target_mismatch' };
    }
  } else if (getHebrewLetterPattern(originalText) !== options.sequence) {
    return { error: 'export_sequence_mismatch' };
  }
  return { options, originalText, includeKollel: options.method === 'gematria' && options.value === calculation.fullGematria + 1 };
}

function reportScope(options, data) {
  if (options.parshaId) return `פרשת ${TANACH_PARSHIOT.find(item => item.id === options.parshaId).nameHe}`;
  if (options.currentParshah && data.weeklyParshah) return `פרשת השבוע · ${data.weeklyParshah.nameHe}`;
  if (options.parshaScope) return 'כל הפרשיות';
  return 'תוצאות התנ״ך בהתאם לסינון';
}

function matchExplanation(match, method) {
  const calculation = computeAll(match.text);
  if (method === 'gematria') return `גימטריה ${match.gematria ?? calculation.fullGematria}`;
  const letters = method === 'initials' ? calculation.initials : calculation.finals;
  const value = method === 'initials' ? calculation.initialsGematria : calculation.finalsGematria;
  return `${METHOD_LABELS[method]}: ${letters} · ${value} · גימטריית הטקסט: ${calculation.fullGematria}`;
}

export function buildTanachReportHtml({ data, options, originalText, includeKollel = false, fontData, attribution = '' }) {
  let groupKey = null;
  const groups = new Map();
  for (const match of data.results) {
    const portion = getParshahForReference(match);
    const key = portion?.id || match.bookSlug;
    if (!groups.has(key)) groups.set(key, { name: portion ? `${match.bookName} · פרשת ${portion.nameHe}` : match.bookName, count: 0 });
    groups.get(key).count += 1;
  }
  const rows = data.results.map((match, index) => {
    const portion = getParshahForReference(match);
    const key = portion?.id || match.bookSlug;
    const group = groups.get(key);
    const heading = key !== groupKey ? `<h2>${escapeReportText(group.name)} <span>${group.count.toLocaleString('he-IL')} התאמות</span></h2>` : '';
    groupKey = key;
    return `${heading}<article class="match" data-match-index="${index + 1}" data-reference="${escapeReportText(`${match.bookSlug}:${match.chapter}:${match.verse}:${match.start}:${match.end}`)}">
      <div class="reference"><bdi>${index + 1}</bdi><strong>${escapeReportText(formatHebrewReference(match.bookName, match.chapter, match.verse))}</strong><span>${escapeReportText(matchExplanation(match, options.method))}</span></div>
      <p class="match-text">${escapeReportText(match.text)}</p>
    </article>`;
  }).join('');
  const targetLabel = options.method === 'gematria' ? `הערך שנחפש: ${options.value}${includeKollel ? ' · כולל +1' : ''}`
    : `האותיות המבוקשות: ${options.sequence}${options.orderIndependent ? ' · אותן אותיות בכל סדר' : ''}`;
  const scope = reportScope(options, data);
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><title>גימטריה — ${escapeReportText(scope)}</title><style>
    @font-face{font-family:ReportHebrew;src:url(data:font/ttf;base64,${fontData});font-weight:100 900;font-style:normal;font-display:block}
    @page{size:A4;margin:18mm 17mm 20mm}
    *{box-sizing:border-box}html{direction:rtl}body{margin:0;color:#172b43;background:white;font-family:ReportHebrew,serif;font-size:11pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    header{border-bottom:2px solid #b58b34;padding:0 0 15pt;margin-bottom:20pt}header .brand{font-size:10pt;color:#8a6b29;margin-bottom:9pt}h1{font-size:23pt;margin:0 0 8pt;line-height:1.6;font-weight:700}.original{text-align:right;font-size:17pt;line-height:1.9;margin:8pt 0;overflow-wrap:anywhere;unicode-bidi:plaintext}.scope{font-size:13pt;color:#34465d;margin:5pt 0}.summary{line-height:1.9;color:#58667a;font-size:10pt}.summary strong{color:#172b43}.search-note{font-size:10pt;color:#58667a;overflow-wrap:anywhere}
    h2{font-size:14pt;line-height:1.8;margin:22pt 0 5pt;padding:7pt 10pt;background:#f6f1e7;border-right:3px solid #b58b34;break-after:avoid-page}h2 span{font-size:9pt;font-weight:400;color:#746a58;margin-right:8pt}
    .match{padding:11pt 0 13pt;border-bottom:1px solid #e9e5dc;break-inside:avoid-page}.reference{display:flex;align-items:baseline;gap:9pt;flex-wrap:wrap;color:#6b7787;font-size:9pt;line-height:1.9}.reference>bdi{font-size:8pt;min-width:14pt;color:#a58a54}.reference strong{color:#243c56;font-size:10pt;font-weight:650}.match-text{margin:7pt 0 0;font-size:15pt;line-height:1.95;overflow-wrap:anywhere}.empty{padding:20pt 0}footer{font-size:8pt;color:#778295;line-height:1.8;margin-top:22pt}
  </style></head><body><header><div class="brand">גימטריה · דוח התאמות</div><h1>${escapeReportText(scope)}</h1><p class="original" dir="auto">${escapeReportText(originalText)}</p><div class="summary">${escapeReportText(targetLabel)} · ${escapeReportText(METHOD_LABELS[options.method])} · ${escapeReportText(TYPE_LABELS[options.type || 'all'])}<br><strong>${data.results.length.toLocaleString('he-IL')} התאמות · כל התוצאות המסוננות</strong></div>${options.search ? `<p class="search-note">חיפוש בתוצאות: ${escapeReportText(options.search)}</p>` : ''}</header>
  <main>${rows || '<p class="empty">לא נמצאו התאמות בסינון שנבחר.</p>'}</main>${attribution ? `<footer>${escapeReportText(attribution)}</footer>` : ''}</body></html>`;
}

async function chromiumExecutable() {
  const explicit = process.env.GEMATRIA_PDF_CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit) return explicit;
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const filename of process.platform === 'win32' ? ['chromium.exe', 'chrome.exe'] : ['chromium', 'chromium-browser']) {
      const path = join(directory, filename);
      try { await access(path, constants.X_OK); return path; } catch {}
    }
  }
  // Also supports a normally installed Playwright browser without requiring it.
  return undefined;
}

export async function renderTanachPdf(report, { signal } = {}) {
  fontPromise ||= readFile(new URL('./assets/fonts/NotoSerifHebrew.ttf', import.meta.url)).then(bytes => bytes.toString('base64'));
  const fontData = await fontPromise;
  const html = buildTanachReportHtml({ ...report, fontData });
  let browser;
  let timedOut = false;
  const close = () => { browser?.close().catch(() => {}); };
  const timer = setTimeout(() => { timedOut = true; close(); }, 45_000);
  timer.unref();
  signal?.addEventListener('abort', close, { once: true });
  try {
    signal?.throwIfAborted();
    browser = await chromium.launch({ headless: true, executablePath: await chromiumExecutable(), timeout: 15_000, args: ['--disable-dev-shm-usage'] });
    signal?.throwIfAborted();
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    const fontsLoaded = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px ReportHebrew') && document.fonts.size > 0; });
    if (!fontsLoaded) throw new Error('Hebrew report font unavailable');
    const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, tagged: true, outline: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-family:Arial,sans-serif;font-size:9px;color:#738096;text-align:center;width:100%;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    if (timedOut) throw new Error('PDF generation timed out');
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid generated PDF');
    return pdf;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', close);
    await browser?.close().catch(() => {});
  }
}

export function registerTanachPdfRoutes(app, { pool, requireAuth, renderPdf = renderTanachPdf }) {
  app.post('/api/tanach/gematria-matches/export.pdf', requireAuth, async (req, res) => {
    const parsed = parseTanachPdfRequest(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (busy) return res.status(429).json({ error: 'pdf_busy' });
    busy = true;
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', onClose);
    try {
      const scopeError = await validateTanachGematriaScope(pool, parsed.options);
      if (scopeError) return res.status(400).json({ error: scopeError });
      const data = await exportTanachGematria(pool, parsed.options);
      if (data.results.length !== data.total) throw new Error('Incomplete PDF export result set');
      if (data.results.length > MAX_REPORT_RESULTS) return res.status(413).json({ error: 'pdf_too_large' });
      const source = await pool.query('SELECT attribution FROM tanach_sources ORDER BY imported_at DESC LIMIT 1');
      const pdf = await renderPdf({ ...parsed, data, attribution: source.rows[0]?.attribution || '' }, { signal: controller.signal });
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="gematria-${parsed.options.method === 'gematria' ? parsed.options.value : parsed.options.method}-${parsed.options.parshaId || (parsed.options.parshaScope ? 'torah' : 'tanach')}.pdf"`,
        'Cache-Control': 'private, no-store', 'X-Result-Count': String(data.results.length), 'X-Parsha-Scope': parsed.options.parshaId || (parsed.options.parshaScope ? 'torah' : 'tanach') });
      res.send(pdf);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('/api/tanach/gematria-matches/export.pdf error:', error.message);
        if (!res.headersSent) res.status(503).json({ error: 'pdf_unavailable' });
      }
    } finally {
      busy = false;
      res.removeListener('close', onClose);
    }
  });
}

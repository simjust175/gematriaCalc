import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { computeAll } from '../src/composables/useGematria.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';
import { TANACH_PARSHIOT, getParshahForReference } from '../server/tanachParshiot.js';

test.use({ serviceWorkers: 'block' });
async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password');
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}
function query(page, path, predicate = () => true) {
  return page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === path && predicate(new URL(r.url()).searchParams));
}
async function library(page) {
  await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'כלי התאמות שמורות' })).toBeVisible();
  await expect(page.locator('#saved-library-panel')).not.toHaveAttribute('aria-busy', 'true');
}
async function save(page, parents, verse) {
  const end = computeAll(verse.display_text).words[0].word.length - 1;
  const word = createTanachCursor(verse.display_text).range(0, end).text;
  const r = await page.request.post('/api/entries/curated-matches', { data: {
    parentOriginalText: String(computeAll(word).fullGematria), matches: [{ originalText: word, reasonCode: 'full_gematria',
      tanachContext: { bookSlug: verse.book_slug, chapter: verse.chapter, verse: verse.verse, start: 0, end } }],
  } });
  expect(r.ok()).toBe(true); const saved = await r.json();
  if (saved.parentCreated) parents.add(saved.parentId);
}
async function saveStart(page, parents, portion) {
  const r = await page.request.get('/api/tanach/verse', { params: { book: portion.start.bookSlug, chapter: portion.start.chapter, verse: portion.start.verse } });
  expect(r.ok()).toBe(true); await save(page, parents, (await r.json()).verse);
}
async function clean(page, parents) {
  for (const id of parents) expect((await page.request.delete(`/api/entries/${id}`)).ok()).toBe(true);
}
async function portion(page, id) {
  const r = query(page, '/api/entries/curated-matches', p => p.get('parsha_scope') === 'torah' && !p.get('parsha'));
  await page.getByRole('button', { name: 'לפי פרשה', exact: true }).click(); await r;
  const select = page.getByRole('dialog', { name: 'סינון הספרייה' }).getByRole('combobox', { name: 'פרשה', exact: true });
  await expect(select).toBeFocused(); await expect(select.locator('optgroup')).toHaveCount(5); await expect(select.locator('option')).toHaveCount(55);
  if (id) {
    const chosen = query(page, '/api/entries/curated-matches', p => p.get('parsha_id') === id);
    await select.selectOption(id); expect((await chosen).ok()).toBe(true);
  }
  await page.keyboard.press('Escape');
}
async function pdf(page, count) {
  const r = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/entries/curated-matches/export.pdf');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'הורד PDF', exact: true }).click();
  const response = await r; expect(response.status()).toBe(200);
  expect(response.headers()['x-collection']).toBe('saved-matches'); expect(Number(response.headers()['x-result-count'])).toBe(count);
  const download = await event; expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-');
  return { download, params: response.request().postDataJSON().query };
}

test('calculator loses only the secondary toolbar; original filters, weekly discovery and individual saving still work', async ({ page }, info) => {
  await login(page); const parents = new Set();
  try {
    await page.locator('.heb-input').fill('502'); const d = page.locator('.gematria-discovery');
    await expect(d.locator('.match-card:not(.skeleton-card)').first()).toBeVisible();
    await expect(d.locator('.discovery-actions, .selection-mode-toggle, .curated-save-bar')).toHaveCount(0);
    for (const name of ['לפי פרשה', 'בחירה מרובה', 'הורד PDF']) await expect(d.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.locator('.result-section').first()).toContainText('502');
    await d.locator('.source-selector').getByRole('button', { name: 'תנ״ך', exact: true }).click();
    let response = query(page, '/api/tanach/gematria-matches', p => p.get('parsha') === 'current');
    await d.locator('.parshah-filter').click(); expect((await response).ok()).toBe(true);
    response = query(page, '/api/tanach/gematria-matches', p => !p.get('parsha'));
    await d.locator('.parshah-filter').click(); await response;
    await d.getByRole('combobox', { name: 'ספר', exact: true }).click(); await d.getByRole('option', { name: 'בראשית', exact: true }).click();
    response = query(page, '/api/tanach/gematria-matches', p => p.get('parsha_id') === 'noach');
    await d.getByRole('combobox', { name: 'פרשה', exact: true }).click(); await d.getByRole('option', { name: 'נח', exact: true }).click();
    const data = await (await response).json(); expect(data.results.length).toBeGreaterThan(0);
    expect(data.results.every(row => getParshahForReference(row)?.id === 'noach')).toBe(true);
    await expect(d.getByRole('switch', { name: 'כולל', exact: true })).toBeVisible();
    await expect(d.getByRole('button', { name: 'ראשי תיבות', exact: true })).toBeDisabled();
    await d.locator('.discovery-header').evaluate(node => node.scrollIntoView({ block: 'start' })); await page.evaluate(() => scrollBy(0, -80));
    await page.screenshot({ path: `artifacts/toolbar-calculator-${info.project.name}.png` });
    const saving = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/entries/curated-matches');
    await d.locator('.match-card:not(.skeleton-card)').first().getByRole('button', { name: 'שמור התאמה', exact: true }).click();
    const saved = await (await saving).json(); if (saved.parentCreated) parents.add(saved.parentId);
    await expect(d.locator('.curated-message')).toContainText('ההתאמה נשמרה');
    await page.getByRole('button', { name: 'הצג בשמורים', exact: true }).click();
    await expect(page.locator(`[data-match-key="tanach:${saved.matches[0].id}"]`)).toBeFocused();
  } finally { await clean(page, parents); }
});

test('Saved Library reuses its portion filter and exports the complete saved collection beyond its first page', async ({ page }, info) => {
  await login(page); const parents = new Set();
  try {
    const verses = [];
    for (const chapter of [1, 7]) verses.push(...(await (await page.request.get('/api/tanach/verses', { params: { book: 'Genesis', chapter } })).json()).verses);
    for (const verse of [...verses].reverse()) await save(page, parents, verse);
    await library(page); await portion(page, ''); await expect(page.locator('[data-match-key]')).toHaveCount(40);
    const all = await pdf(page, verses.length); expect(all.params.parsha_scope).toBe('torah'); expect(all.params.offset).toBeUndefined();
    if (info.project.name === 'desktop-chromium') await all.download.saveAs('artifacts/toolbar-saved-library-browser.pdf');
    await page.locator('.load-more-btn').click(); await expect(page.locator('[data-match-key]')).toHaveCount(verses.length);
    await expect(page.locator('.saved-parsha-heading')).toHaveCount(2);
    await portion(page, 'noach'); await expect(page.locator('[data-match-key]')).toHaveCount(verses.filter(v => v.chapter === 7).length);
    const expected = await (await page.request.get('/api/entries/curated-matches?parsha_id=noach&limit=100')).json();
    expect(await page.locator('[data-match-key]').evaluateAll(nodes => nodes.map(n => n.dataset.matchKey))).toEqual(expected.matches.map(row => row.key));
    await page.locator('.library-header').scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/toolbar-saved-library-${info.project.name}.png` });
    await page.getByRole('button', { name: 'סינון', exact: true }).click();
    await page.getByRole('dialog', { name: 'סינון הספרייה' }).getByRole('combobox', { name: 'סוג התאמה', exact: true }).selectOption('full_gematria');
    await page.keyboard.press('Escape');
    const search = expected.matches[0].parentOriginalText;
    const response = query(page, '/api/entries/curated-matches', p => p.get('search') === search);
    await page.locator('.search-input').fill(search); const selected = await (await response).json(); expect(selected.total).toBeGreaterThan(0);
    expect((await pdf(page, selected.total)).params).toMatchObject({ parsha_id: 'noach', search, matchType: 'full_gematria' });
    expect((await (await page.request.get('/api/entries/curated-matches?limit=100')).json()).total).toBe(verses.length);
  } finally { await clean(page, parents); }
});

test('weekly saved filtering uses the real schedule, refreshes persisted matches, and never falls back from an empty portion', async ({ page }, info) => {
  await login(page); const parents = new Set();
  try {
    const weekly = (await (await page.request.get('/api/entries/curated-matches')).json()).weeklyParshah;
    const other = weekly?.ids.includes('bereshit') ? TANACH_PARSHIOT.find(p => p.id === 'shemot') : TANACH_PARSHIOT[0];
    await saveStart(page, parents, other); await library(page);
    let response = query(page, '/api/entries/curated-matches', p => p.get('parsha') === 'current');
    await page.getByRole('button', { name: 'פרשת השבוע', exact: true }).click(); expect((await (await response).json()).total).toBe(0);
    await expect(page.locator('.empty-state')).toContainText('אין התאמות שמורות'); await expect(page.locator('[data-match-key]')).toHaveCount(0);
    for (const id of weekly?.ids || []) await saveStart(page, parents, TANACH_PARSHIOT.find(p => p.id === id));
    await page.reload(); await library(page);
    response = query(page, '/api/entries/curated-matches', p => p.get('parsha') === 'current');
    await page.getByRole('button', { name: 'פרשת השבוע', exact: true }).click(); const data = await (await response).json();
    expect(data.total).toBe(weekly?.ids.length || 0); expect(data.matches.every(row => weekly.ids.includes(row.parshaId))).toBe(true);
    await expect(page.locator('[data-match-key]')).toHaveCount(data.total);
    if (weekly) await expect(page.locator('.saved-scope-label')).toContainText(weekly.nameHe);
    await page.screenshot({ path: `artifacts/toolbar-weekly-${info.project.name}.png` });
    await portion(page, TANACH_PARSHIOT.find(p => p.id !== other.id && !weekly?.ids.includes(p.id)).id);
    await expect(page.locator('.empty-state')).toContainText('אין התאמות שמורות'); await expect(page.locator('[data-match-key]')).toHaveCount(0);
  } finally { await clean(page, parents); }
});

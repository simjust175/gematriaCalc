import { test, expect } from '@playwright/test';
import { readFile, copyFile } from 'node:fs/promises';
import { TANACH_PARSHIOT } from '../server/tanachParshiot.js';
import { toHebrewNumber } from '../src/composables/useGematria.js';

test.use({ serviceWorkers: 'block' });
const password = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';
const portionOrder = new Map(TANACH_PARSHIOT.map((portion) => [portion.id, portion.canonicalOrder]));

function waitDiscovery(page, predicate) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET'
      && url.pathname === '/api/tanach/gematria-matches'
      && predicate(url.searchParams);
  });
}
async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}
async function startTorah(page, input = '502') {
  await login(page);
  await page.locator('.heb-input').fill(input);
  await expect(page.locator('.match-card:not(.skeleton-card)').first()).toBeVisible();
  const request = waitDiscovery(page, (params) => params.get('parsha_scope') === 'torah'
    && params.get('page') === '1');
  await page.getByRole('button', { name: 'לפי פרשה', exact: true }).click();
  const response = await request;
  expect(response.ok()).toBe(true);
  const data = await response.json();
  await expect(page.getByRole('region', { name: 'התאמות לפי פרשה' })).toBeVisible();
  await expect(page.locator('.parsha-option')).toHaveCount(54);
  return data;
}
async function choosePortion(page, id) {
  const panel = page.getByRole('region', { name: 'התאמות לפי פרשה' });
  if (!await panel.isVisible()) await page.getByRole('button', { name: 'לפי פרשה', exact: true }).click();
  const request = waitDiscovery(page, (params) => params.get('parsha_scope') === 'torah'
    && (params.get('parsha_id') || '') === id && params.get('page') === '1');
  if (id) {
    const option = panel.locator(`button[data-parsha-id="${id}"]`);
    const group = option.locator('xpath=ancestor::details');
    if (!await group.evaluate((element) => element.open)) await group.locator('summary').click();
    await option.click();
  } else await panel.getByRole('button', { name: /^כל הפרשיות/ }).click();
  const response = await request;
  expect(response.ok()).toBe(true);
  return response.json();
}
async function closePanel(page) {
  const panel = page.getByRole('region', { name: 'התאמות לפי פרשה' });
  if (await panel.isVisible()) await panel.getByRole('button', { name: 'סגור בחירת פרשה', exact: true }).click();
}
async function libraryFilter(page, id) {
  await page.getByRole('button', { name: 'סינון', exact: true }).click();
  const filter = page.getByRole('dialog', { name: 'סינון הספרייה' });
  const select = filter.getByRole('combobox', { name: 'פרשה', exact: true });
  await expect(select).toBeEnabled();
  const response = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/api/entries/curated-matches'
      && (url.searchParams.get('parsha_id') || '') === id;
  });
  await select.selectOption(id);
  expect((await response).ok()).toBe(true);
  await page.keyboard.press('Escape');
}
function assertHeadingOrder(ids) {
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.map((id) => portionOrder.get(id))).toEqual(ids.map((id) => portionOrder.get(id)).sort((a, b) => a - b));
}

test('502 uses one global distribution, shows 54 real counts, appends ordered groups and downloads every filtered PDF row', async ({ page }, testInfo) => {
  const aggregationRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/tanach/gematria-matches' && url.searchParams.get('parsha_scope') === 'torah'
      && !url.searchParams.get('parsha_id') && url.searchParams.get('page') === '1') aggregationRequests.push(url);
  });
  const data = await startTorah(page);
  expect(aggregationRequests).toHaveLength(1);
  const panel = page.getByRole('region', { name: 'התאמות לפי פרשה' });
  const portions = data.parshaBreakdown.books.flatMap((book) => book.parshiot);
  expect(portions).toHaveLength(54);
  for (const portion of portions) {
    await expect(panel.locator(`button[data-parsha-id="${portion.id}"] .parsha-count`))
      .toHaveText(portion.total.toLocaleString('he-IL'));
  }
  expect(portions.reduce((sum, portion) => sum + portion.total, 0)).toBe(data.total);
  await panel.scrollIntoViewIfNeeded();
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/parsha-502-${testInfo.project.name}-panel.png`, fullPage: true });
  await page.locator('.gematria-discovery').evaluate((element) => window.scrollTo({
    top: scrollY + element.getBoundingClientRect().top - 76, behavior: 'instant',
  }));
  await page.screenshot({ path: `artifacts/parsha-502-${testInfo.project.name}-viewport.png`, fullPage: false });
  await closePanel(page);
  await expect(page.locator('.match-card:not(.skeleton-card)')).toHaveCount(data.results.length);
  assertHeadingOrder(await page.locator('.parsha-result-heading').evaluateAll((nodes) => nodes.map((node) => node.dataset.parshaId)));
  const next = waitDiscovery(page, (params) => params.get('parsha_scope') === 'torah' && params.get('page') === '2');
  await page.locator('.gematria-discovery .load-more').click();
  const second = await (await next).json();
  await expect(page.locator('.match-card:not(.skeleton-card)')).toHaveCount(data.results.length + second.results.length);
  assertHeadingOrder(await page.locator('.parsha-result-heading').evaluateAll((nodes) => nodes.map((node) => node.dataset.parshaId)));
  await expect(page.locator('.source-badge--tefillot')).toHaveCount(0);
  await page.screenshot({ path: `artifacts/parsha-502-${testInfo.project.name}-results.png`, fullPage: true });

  const pdfResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/tanach/gematria-matches/export.pdf');
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'הורד PDF', exact: true }).click();
  const response = await pdfResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect(Number(response.headers()['x-result-count'])).toBe(data.total);
  const requestBody = response.request().postDataJSON();
  expect(requestBody.originalText).toBe('502');
  expect(requestBody.query.parsha_scope).toBe('torah');
  expect(Number(requestBody.query.value)).toBe(502);
  const download = await pdfDownload;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(5000);
  expect((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length).toBeGreaterThan(1);
  if (testInfo.project.name === 'desktop-chromium') await copyFile(path, 'artifacts/parsha-502.pdf');
});

test('portion choices, all Torah, whole words, kollel, initials and finals remain explicit and keyboard accessible', async ({ page }) => {
  await page.route('**/api/tanach/books', (route) => route.fulfill({
    status: 503, json: { error: 'optional_catalog_temporarily_unavailable' },
  }));
  const baseline = await startTorah(page);
  const first = await choosePortion(page, 'bereshit');
  expect(first.results.every((row) => row.parshaId === 'bereshit')).toBe(true);
  const second = await choosePortion(page, 'noach');
  expect(second.results.every((row) => row.parshaId === 'noach')).toBe(true);
  await expect(page.getByRole('button', { name: 'לפי פרשה', exact: true }).locator('.selected-parsha')).toHaveText('נח');
  const reset = await choosePortion(page, '');
  expect(reset.total).toBe(baseline.total);
  await closePanel(page);
  const discovery = page.locator('.gematria-discovery');
  let request = waitDiscovery(page, (params) => params.get('parsha_scope') === 'torah' && params.get('type') === 'whole_word');
  await discovery.getByRole('button', { name: /מילה שלמה/ }).click();
  const wordData = await (await request).json();
  expect(wordData.results.every((row) => row.type === 'whole_word')).toBe(true);
  request = waitDiscovery(page, (params) => params.get('parsha_scope') === 'torah' && params.get('value') === '503');
  await discovery.getByRole('switch', { name: 'כולל', exact: true }).click();
  expect((await (await request).json()).target).toBe(503);
  await expect(discovery.getByRole('switch', { name: 'כולל', exact: true })).toHaveAttribute('aria-checked', 'true');

  await page.locator('.heb-input').fill('בב');
  request = waitDiscovery(page, (params) => params.get('parsha_scope') === 'torah'
    && params.get('method') === 'initials' && params.get('sequence') === 'בב');
  await discovery.getByRole('button', { name: 'ראשי תיבות', exact: true }).click();
  expect((await (await request).json()).method).toBe('initials');
  await page.locator('.heb-input').fill('תא');
  request = waitDiscovery(page, (params) => params.get('parsha_scope') === 'torah'
    && params.get('method') === 'finals' && params.get('sequence') === 'תא');
  await discovery.getByRole('button', { name: 'סופי תיבות', exact: true }).click();
  expect((await (await request).json()).method).toBe('finals');
  const trigger = page.getByRole('button', { name: 'לפי פרשה', exact: true });
  await trigger.click();
  await page.getByRole('region', { name: 'התאמות לפי פרשה' }).getByRole('button', { name: 'סגור בחירת פרשה' }).focus();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('two 502 matches save under one search, focus exactly, filter by their actual Parsha after refresh and reopen their sources', async ({ page }, testInfo) => {
  await startTorah(page);
  const saves = [];
  try {
    for (const id of ['bereshit', 'noach']) {
      const data = await choosePortion(page, id);
      const expected = data.results[0];
      await closePanel(page);
      const card = page.locator('.match-card:not(.skeleton-card)').first();
      const saving = page.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/entries/curated-matches');
      await card.getByRole('button', { name: 'שמור התאמה', exact: true }).click();
      const response = await saving;
      expect(response.ok()).toBe(true);
      const saved = await response.json();
      saves.push({ ...saved, expected });
      await expect(page.locator('.curated-message')).toContainText('ההתאמה נשמרה');
      await page.getByRole('button', { name: 'הצג בשמורים', exact: true }).click();
      const row = page.locator(`[data-match-key="tanach:${saved.matches[0].id}"]`);
      await expect(row).toBeFocused();
      await expect(row).toHaveAttribute('data-parent-entry-id', String(saved.parentId));
      if (id === 'bereshit') await page.locator('.app-header').getByRole('button', { name: 'מחשבון', exact: true }).click();
    }
    expect(saves[0].parentId).toBe(saves[1].parentId);
    await libraryFilter(page, 'bereshit');
    await expect(page.locator(`[data-match-key="tanach:${saves[0].matches[0].id}"]`)).toBeVisible();
    await expect(page.locator(`[data-match-key="tanach:${saves[1].matches[0].id}"]`)).toHaveCount(0);
    await page.reload();
    await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
    await libraryFilter(page, 'noach');
    const second = page.locator(`[data-match-key="tanach:${saves[1].matches[0].id}"]`);
    await expect(second).toBeVisible();
    await page.screenshot({ path: `artifacts/parsha-saved-filter-${testInfo.project.name}.png`, fullPage: true });
    await second.getByRole('button', { name: /פעולות עבור/ }).click();
    await page.getByRole('menuitem', { name: 'למקור', exact: true }).click();
    const expected = saves[1].expected;
    await expect(page.locator('.verse-toolbar h2')).toHaveText(`${expected.bookName} ${toHebrewNumber(expected.chapter)}:${toHebrewNumber(expected.verse)}`);
    await expect(page.locator('.verse-token--letter.verse-token--range')).toHaveCount(expected.end - expected.start + 1);
    await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
    await libraryFilter(page, 'noach');
    await second.getByRole('button', { name: /פעולות עבור/ }).click();
    await page.getByRole('menuitem', { name: 'הסר משמורים', exact: true }).click();
    await page.getByRole('dialog', { name: 'להסיר את ההתאמה?', exact: true })
      .getByRole('button', { name: 'הסר משמורים', exact: true }).click();
    const remaining = await page.request.get(`/api/entries/curated-matches?parsha_id=bereshit&search=502`);
    const rows = (await remaining.json()).matches;
    expect(rows.some((row) => row.id === saves[0].matches[0].id && row.parentId === saves[0].parentId)).toBe(true);
  } finally {
    const parent = saves.find((saved) => saved.parentCreated);
    if (parent) await page.request.delete(`/api/entries/${parent.parentId}`);
    else for (const saved of saves) await page.request.delete(`/api/entries/${saved.parentId}/curated-matches/${saved.matches[0].id}`);
  }
});

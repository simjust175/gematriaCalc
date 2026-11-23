import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || (() => {
  try { return execSync('command -v chromium', { encoding: 'utf8' }).trim(); }
  catch { return undefined; }
})();
if (systemChromium) test.use({ launchOptions: { executablePath: systemChromium } });
// The app registers a network-forwarding service worker. Playwright page.route
// cannot intercept fetches handled by an active service worker; disabling
// service workers only in these mocked browser tests keeps real app behavior
// and the other service-worker regression tests unchanged.
test.use({ serviceWorkers: 'block' });

const one = {
  baseWordId: 1, baseWordText: 'בראשית', value: 913,
  bookSlug: 'Genesis', bookName: 'בראשית', chapter: 1, verse: 1,
  start: 0, end: 5, text: 'בְּרֵאשִׁית', type: 'whole_word',
};
const two = {
  baseWordId: 2, baseWordText: 'ברא', value: 203,
  bookSlug: 'Genesis', bookName: 'בראשית', chapter: 1, verse: 1,
  start: 6, end: 8, text: 'בָּרָא', type: 'whole_word',
};
function mockWeeklyResponse(url) {
  const params = new URL(url).searchParams;
  const page = Number(params.get('page') || 1);
  const wordId = params.get('word_id');
  const filtered = wordId ? (wordId === '2' ? [two] : [one]) : (page === 1 ? [one] : [two]);
  return {
    parsha: { nameHe: 'בראשית', shabbatDate: '2026-10-10' },
    words: [{ id: 1, text: 'בראשית', value: 913, count: 1 }, { id: 2, text: 'ברא', value: 203, count: 1 }],
    baseWordCount: 2, total: 2, results: filtered,
    selectedTotal: wordId ? 1 : 2, page, limit: 50,
    hasMore: !wordId && page === 1,
  };
}
async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}
test('weekly Parsha button works on an empty input and opens a canonical Tanach verse', async ({ page }) => {
  await page.route(/\/api\/base-words\/weekly-parsha(?:\?|$)/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockWeeklyResponse(route.request().url())) })
  );
  await login(page);
  const textarea = page.locator('.heb-input');
  await textarea.fill('');
  const button = page.getByRole('button', { name: 'מילות יסוד בפרשה' });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('.weekly-scan')).toBeVisible();
  await expect(page.locator('.weekly-scan h2')).toContainText('בראשית');
  await expect(page.locator('.weekly-scan .match-row')).toHaveCount(1);
  await expect(textarea).toHaveValue('');
  await page.locator('.weekly-scan .weekly-save').first().click();
  await page.getByRole('menuitem', { name: 'פתח בתנ״ך' }).click();
  await expect(page.locator('.tanach-page')).toBeVisible();
  await expect(page.locator('.weekly-scan')).toHaveCount(0);
  await expect(page.locator('.weekly-actions-menu')).toHaveCount(0);
  await expect(page.locator('.verse-display')).toHaveAttribute('aria-label', 'סמן אות בפסוק בראשית א:א');
  await expect(page.locator('.verse-display')).toHaveAttribute('aria-valuetext', 'בחירה מאות 1 עד אות 6 מתוך 28');
});

async function showActions(page, index = 0) {
  const trigger = page.locator('.weekly-scan .weekly-save').nth(index);
  await trigger.click();
  await expect(page.getByRole('menu', { name: /^פעולות/ })).toBeVisible();
  return trigger;
}

async function fixture(page, results) {
  await page.route(/\/api\/base-words\/weekly-parsha(?:\?|$)/, route => route.fulfill({
    json: { ...mockWeeklyResponse(route.request().url()), results, total: results.length, selectedTotal: results.length, hasMore: false },
  }));
  await page.getByRole('button', { name: 'מילות יסוד בפרשה' }).click();
  await expect(page.locator('.weekly-scan .match-row')).toHaveCount(results.length);
}

test('weekly row saves use the cited text and base-word parent, prevent duplicates and hydrate after reload', async ({ page }) => {
  await login(page);
  const baseIds = [], parentIds = [];
  try {
    for (const text of ['אבר', 'ארב']) {
      const response = await page.request.post('/api/base-words', { data: { originalText: text, sourceType: 'manual' } });
      expect(response.status()).toBe(201);
      baseIds.push((await response.json()).item.id);
    }
    const results = ['אבר', 'ארב'].map((text, index) => ({ ...two, baseWordText: text, baseWordId: baseIds[index] }));
    await page.locator('.heb-input').fill('שלום');
    await fixture(page, results);
    await showActions(page);
    const baseSave = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/base-words');
    await page.getByRole('menuitem', { name: 'שמור כמילת יסוד', exact: true }).click();
    const savedBase = await baseSave;
    expect(savedBase.status()).toBe(201);
    expect(savedBase.request().postDataJSON()).toEqual({ originalText: two.text, sourceType: 'tanach' });
    baseIds.push((await savedBase.json()).item.id);
    await expect(page.getByRole('status').filter({ hasText: 'נשמר כמילת יסוד' })).toBeVisible();

    await showActions(page);
    await expect(page.getByRole('menuitem', { name: 'נשמר כמילת יסוד', exact: true })).toBeDisabled();
    const matchSave = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/entries/curated-matches');
    await expect(page.getByRole('menuitem', { name: 'שמור כהתאמה', exact: true })).toBeEnabled();
    await page.getByRole('menuitem', { name: 'שמור כהתאמה', exact: true }).click();
    const savedMatch = await matchSave;
    expect(savedMatch.status()).toBe(200);
    const payload = await savedMatch.json();
    parentIds.push(payload.parentId);
    expect(savedMatch.request().postDataJSON()).toEqual({ parentOriginalText: 'אבר', matches: [{
      originalText: two.text, tanachContext: { bookSlug: 'Genesis', chapter: 1, verse: 1, start: 6, end: 8 }, reasonCode: 'full_gematria',
    }] });
    await expect(page.getByRole('status').filter({ hasText: 'נשמר כהתאמה' })).toBeVisible();
    await expect(page.locator('.heb-input')).toHaveValue('שלום');
    await showActions(page);
    await expect(page.getByRole('menuitem', { name: 'נשמר כהתאמה', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await showActions(page, 1);
    await expect(page.getByRole('menuitem', { name: 'נשמר כמילת יסוד', exact: true })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'שמור כהתאמה', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');

    // The existing API also deduplicates a concurrent save from another client.
    const duplicate = await page.request.post('/api/entries/curated-matches', { data: savedMatch.request().postDataJSON() });
    expect(duplicate.ok()).toBe(true);
    expect((await duplicate.json()).matches[0].id).toBe(payload.matches[0].id);
    const persisted = await page.request.get(`/api/entries?parentOriginalText=${encodeURIComponent('אבר')}`);
    const parent = (await persisted.json()).entries.find(entry => entry.id === payload.parentId);
    expect(parent.curated_matches).toHaveLength(1);

    await page.reload();
    await expect(page.locator('.heb-input')).toBeVisible();
    await page.getByRole('button', { name: 'מילות יסוד בפרשה' }).click();
    await showActions(page);
    await expect(page.getByRole('menuitem', { name: 'נשמר כמילת יסוד', exact: true })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'נשמר כהתאמה', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await showActions(page, 1);
    await expect(page.getByRole('menuitem', { name: 'שמור כהתאמה', exact: true })).toBeEnabled();
    await page.getByRole('menuitem', { name: 'פתח בתנ״ך' }).click();
    await expect(page.locator('.tanach-page')).toBeVisible();
    await expect(page.locator('.weekly-actions-menu')).toHaveCount(0);
    expect((await page.request.delete(`/api/entries/${payload.parentId}`)).ok()).toBe(true);
    expect((await page.request.delete(`/api/base-words/${baseIds[2]}`)).ok()).toBe(true);
    await page.getByRole('button', { name: 'מחשבון', exact: true }).click();
    await expect(page.locator('.weekly-scan')).toBeVisible();
    await showActions(page);
    await expect(page.getByRole('menuitem', { name: 'שמור כמילת יסוד', exact: true })).toBeEnabled();
    await expect(page.getByRole('menuitem', { name: 'שמור כהתאמה', exact: true })).toBeEnabled();
  } finally {
    for (const id of parentIds) await page.request.delete(`/api/entries/${id}`);
    for (const id of baseIds) await page.request.delete(`/api/base-words/${id}`);
  }
});

for (const kind of ['base', 'match']) {
  test(`weekly ${kind} save handles errors, blocks repeat requests while pending and retries`, async ({ page }) => {
    await login(page);
    await fixture(page, [two]);
    const endpoint = kind === 'base' ? '/api/base-words' : '/api/entries/curated-matches';
    const label = kind === 'base' ? 'שמור כמילת יסוד' : 'שמור כהתאמה';
    const savedLabel = kind === 'base' ? 'נשמר כמילת יסוד' : 'נשמר כהתאמה';
    let posts = 0, release;
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      posts += 1;
      if (posts === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.fulfill({ status: 500, json: { error: 'test_failure' } });
      }
      await route.continue();
    });
    let baseId, parentId;
    try {
      await showActions(page);
      await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
      await expect(page.locator('.weekly-save')).toHaveAttribute('aria-busy', 'true');
      await showActions(page);
      await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeDisabled();
      expect(posts).toBe(1);
      release();
      await expect(page.getByRole('alert').filter({ hasText: 'לא ניתן לשמור' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
      const saved = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === endpoint);
      await page.getByRole('menuitem', { name: label, exact: true }).click();
      const response = await saved;
      expect(response.ok()).toBe(true);
      const payload = await response.json();
      if (kind === 'base') baseId = payload.item.id;
      else parentId = payload.parentId;
      await showActions(page);
      await expect(page.getByRole('menuitem', { name: savedLabel, exact: true })).toBeDisabled();
      expect(posts).toBe(2);
    } finally {
      release?.();
      if (baseId) await page.request.delete(`/api/base-words/${baseId}`);
      if (parentId) await page.request.delete(`/api/entries/${parentId}`);
    }
  });
}

test('weekly base save treats a concurrent duplicate as saved', async ({ page }) => {
  await login(page);
  await fixture(page, [two]);
  await showActions(page);
  await expect(page.getByRole('menuitem', { name: 'שמור כמילת יסוד', exact: true })).toBeEnabled();
  // Create after hydration, as if another tab saved the text at the same time.
  const created = await page.request.post('/api/base-words', { data: { originalText: 'ברא', sourceType: 'tanach' } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).item.id;
  try {
    const duplicate = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/base-words');
    await page.getByRole('menuitem', { name: 'שמור כמילת יסוד', exact: true }).click();
    expect((await duplicate).status()).toBe(409);
    await showActions(page);
    await expect(page.getByRole('menuitem', { name: 'נשמר כמילת יסוד', exact: true })).toBeDisabled();
    const words = await page.request.get('/api/base-words');
    expect((await words.json()).items.filter(item => item.normalizedText === 'ברא')).toHaveLength(1);
  } finally { await page.request.delete(`/api/base-words/${id}`); }
});

test('weekly action menus stay compact, fit the viewport and support keyboard, scrolling and outside dismissal', async ({ page }, testInfo) => {
  await login(page);
  const rows = Array.from({ length: 18 }, (_, index) => ({ ...one, baseWordId: 100 + index }));
  await fixture(page, rows);
  const first = await showActions(page);
  await expect(page.getByRole('menuitem', { name: 'שמור כהתאמה', exact: true })).toBeEnabled();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitem', { name: 'שמור כמילת יסוד', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'שמור כהתאמה', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'פתח בתנ״ך' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  await first.press('ArrowDown');
  await expect(page.locator('.weekly-actions-menu')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.weekly-actions-menu')).toHaveCount(0);

  // Opening the final row scrolls the internal results area. The portalled menu
  // must escape its clipping and flip above the trigger when needed.
  const last = await showActions(page, 17);
  const menu = page.getByRole('menu', { name: /^פעולות/ });
  const bounds = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 7);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 7);
  const layout = await last.evaluate(button => {
    const row = button.closest('.match-row');
    const copy = row.querySelector('.match-copy').getBoundingClientRect();
    const action = button.getBoundingClientRect();
    return { gap: copy.left - action.right, height: row.getBoundingClientRect().height, direction: getComputedStyle(row).flexDirection };
  });
  expect(layout.direction).toBe('row');
  expect(layout.gap).toBeGreaterThanOrEqual(7);
  expect(layout.height).toBeLessThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole('menuitem', { name: 'פתח בתנ״ך' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('weekly-row-actions.png'), animations: 'disabled' });
  await page.locator('.weekly-scan h2').click();
  await expect(menu).toHaveCount(0);
  await showActions(page);
  await page.locator('.weekly-scan .close').click();
  await expect(menu).toHaveCount(0);
});
test('weekly scan preserves typed calculator input, loads remaining pages and filters by saved word', async ({ page }) => {
  await page.route(/\/api\/base-words\/weekly-parsha(?:\?|$)/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockWeeklyResponse(route.request().url())) })
  );
  await login(page);
  const textarea = page.locator('.heb-input');
  await textarea.fill('שלום');
  await page.getByRole('button', { name: 'מילות יסוד בפרשה' }).click();
  await expect(page.locator('.weekly-scan .match-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'הצג עוד התאמות' }).click();
  await expect(page.locator('.weekly-scan .match-row')).toHaveCount(2);
  await page.locator('#weekly-word-filter').selectOption('2');
  await expect(page.locator('.weekly-scan .match-row')).toHaveCount(1);
  await expect(page.locator('.weekly-scan .word')).toContainText('ברא');
  await expect(textarea).toHaveValue('שלום');
  await page.locator('.weekly-scan .close').click();
  await expect(page.locator('.weekly-scan')).toHaveCount(0);
  await expect(textarea).toHaveValue('שלום');
});

import { test, expect } from '@playwright/test';
import { computeAll, normalize } from '../src/composables/useGematria.js';
import { createTanachCursor } from '../src/composables/useTanachCursor.js';

test.use({ serviceWorkers: 'block' });
async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}
const fixtures = [
  {
    id: 'tanach:Genesis:1:1', sourceType: 'tanach', text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים',
    context: 'בראשית א:א', snippet: { before: '', match: 'בְּרֵאשִׁית', after: ' בָּרָא אֱלֹהִים' },
  },
  {
    id: 'tefillot:1', sourceType: 'tefillot', text: 'בְּרֵאשִׁית הָיָה דָבָר',
    context: 'חול · שחרית · ברכות השחר', snippet: { before: '', match: 'בְּרֵאשִׁית', after: ' הָיָה דָבָר' },
  },
];

test('corpus autocomplete is debounced, source-aware, gold-highlighted and keyboard accessible', async ({ page }, testInfo) => {
  await login(page);
  const queries = [];
  await page.route('**/api/corpus/suggestions?*', route => {
    queries.push(new URL(route.request().url()).searchParams.get('q'));
    return route.fulfill({ json: { results: fixtures } });
  });
  const input = page.locator('.heb-input');
  await input.fill('אב');
  await page.waitForTimeout(260);
  expect(queries).toHaveLength(0);
  await input.fill('בראש');
  await input.fill('בראשי');
  await input.fill('בראשית');
  await expect(page.getByRole('listbox', { name: 'מקורות תואמים' })).toBeVisible();
  expect(queries).toEqual(['בראשית']);
  await expect(page.locator('.corpus-source')).toHaveText(['תנ״ך', 'תפילות']);
  await expect(page.locator('.corpus-context').nth(0)).toHaveText('בראשית א:א');
  await expect(page.locator('.corpus-context').nth(1)).toContainText('שחרית');
  await expect(page.locator('.corpus-snippet mark').first()).toHaveText('בְּרֵאשִׁית');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'corpus-suggestion-0');
  await input.press('ArrowDown');
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: testInfo.outputPath('corpus-autocomplete.png') });
  await input.press('Enter');
  await expect(input).toHaveValue(fixtures[1].text);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.locator('.primary-num')).toHaveText(computeAll(fixtures[1].text).fullGematria.toLocaleString('he-IL'));
  await page.waitForTimeout(300);
  expect(queries).toHaveLength(1);
});

test('corpus mouse/touch selection and Escape/outside dismissal preserve ordinary calculator typing', async ({ page }, testInfo) => {
  await login(page);
  await page.route('**/api/corpus/suggestions?*', route => route.fulfill({ json: { results: fixtures } }));
  const input = page.locator('.heb-input');
  await input.fill('בראשית');
  await expect(page.getByRole('option')).toHaveCount(2);
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveValue('בראשית');
  await input.fill('בראשית ב');
  await expect(page.getByRole('listbox')).toBeVisible();
  // Header edge is outside the popup and navigation buttons on both sizes.
  await page.mouse.click(2, 2);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await input.fill('בראשית בר');
  await expect(page.getByRole('option')).toHaveCount(2);
  if (testInfo.project.name === 'mobile-chromium') await page.getByRole('option').first().tap();
  else await page.getByRole('option').first().click();
  await expect(input).toHaveValue(fixtures[0].text);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await input.fill('123');
  await expect(page.locator('.primary-num')).toHaveText('123');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('autocomplete cancels stale responses, handles composition and never invents suggestions on failure', async ({ page }) => {
  await login(page);
  await page.route('**/api/corpus/suggestions?*', async route => {
    if (new URL(route.request().url()).searchParams.get('q') === 'ברא') {
      await new Promise(resolve => setTimeout(resolve, 450));
      return route.fulfill({ json: { results: fixtures } }).catch(() => {});
    }
    return route.fulfill({ status: 503, json: {} });
  });
  const input = page.locator('.heb-input');
  const sent = page.waitForRequest(request => request.url().includes('/api/corpus/suggestions?'));
  await input.fill('ברא');
  await sent;
  await input.fill('אבגדה');
  await page.waitForTimeout(650);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveValue('אבגדה');
  await expect(page.locator('.primary-num')).toHaveText('15');
  let composingRequests = 0;
  await page.route('**/api/corpus/suggestions?*', route => {
    composingRequests++;
    return route.fulfill({ json: { results: [] } });
  });
  await input.dispatchEvent('compositionstart');
  await input.fill('שמע');
  await page.waitForTimeout(300);
  expect(composingRequests).toBe(0);
  await input.dispatchEvent('compositionend');
  await expect.poll(() => composingRequests).toBe(1);
});

test('real canonical autocomplete endpoint is bounded and selects complete normalized corpus text', async ({ page }) => {
  await login(page);
  const response = await page.request.get('/api/corpus/suggestions?q=בְּרֵאשִׁית־בָּרָא&limit=8');
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.results.length).toBeGreaterThan(0);
  expect(data.results.length).toBeLessThanOrEqual(8);
  const row = data.results.find(item => item.id === 'tanach:Genesis:1:1');
  expect(row).toBeDefined();
  const canonical = await page.request.get('/api/tanach/verse?book=Genesis&chapter=1&verse=1');
  const { verse } = await canonical.json();
  expect(row.text).toBe(verse.display_text);
  expect(normalize(row.snippet.match)).toBe('בראשית ברא');
  const input = page.locator('.heb-input');
  await input.fill('בראשית ברא');
  const option = page.getByRole('option').filter({ hasText: 'בראשית א:א' });
  await expect(option).toBeVisible();
  await option.click();
  await expect(input).toHaveValue(verse.display_text);
  await expect(page.locator('.primary-num')).toHaveText(computeAll(verse.display_text).fullGematria.toLocaleString('he-IL'));
});

test('full verse pill counts canonical matches, applies Kollel target and excludes prayer results in all mode', async ({ page }) => {
  await login(page);
  const response = await page.request.get('/api/tanach/verse?book=Genesis&chapter=1&verse=1');
  const { verse: canonical } = await response.json();
  const text = canonical.display_text;
  const target = computeAll(text).fullGematria;
  await page.locator('.heb-input').fill(String(target - 1));
  const discovery = page.locator('.gematria-discovery');
  await discovery.locator('.kollel-toggle').click();
  const full = discovery.getByRole('button', { name: /פסוק שלם/ });
  await expect(full).toBeVisible();
  const loaded = page.waitForResponse(response => response.url().includes('/api/tanach/gematria-matches')
    && new URL(response.url()).searchParams.get('type') === 'whole_verse');
  await full.click();
  const resultResponse = await loaded;
  expect(resultResponse.status()).toBe(200);
  const data = await resultResponse.json();
  expect(data.target).toBe(target);
  expect(data.total).toBeGreaterThan(0);
  await expect(full.locator('span')).toHaveText(String(data.counts.whole_verse));
  await expect(discovery.locator('.source-badge--tefillot')).toHaveCount(0);
  for (const row of data.results) {
    const verseResponse = await page.request.get(`/api/tanach/verse?book=${row.bookSlug}&chapter=${row.chapter}&verse=${row.verse}`);
    const { verse } = await verseResponse.json();
    expect(row.start).toBe(0);
    expect(row.end).toBe(createTanachCursor(verse.display_text).count - 1);
    expect(computeAll(verse.display_text).fullGematria).toBe(target);
    expect(normalize(row.text)).toBe(normalize(verse.display_text));
  }
  const source = discovery.locator('.source-selector');
  await source.getByRole('button', { name: 'תנ״ך', exact: true }).click();
  await expect(full).toBeVisible();
  if (process.env.E2E_TEFILLOT_ENABLED === 'true') {
    await source.getByRole('button', { name: 'תפילות', exact: true }).click();
    await expect(full).toHaveCount(0);
    await expect(discovery.getByRole('button', { name: /^הכול/ })).toHaveAttribute('aria-pressed', 'true');
    await source.getByRole('button', { name: 'הכל', exact: true }).click();
    await expect(full).toBeVisible();
  }
});

test('zero-count full verse filter remains selectable with a clean empty state', async ({ page }) => {
  await login(page);
  await page.route('**/api/tanach/gematria-matches?*', route => route.fulfill({ json: {
    results: [], counts: { all: 0, whole_word: 0, whole_phrase: 0, whole_verse: 0 }, total: 0, hasMore: false,
  } }));
  await page.route('**/api/tefillot/gematria-matches?*', route => route.fulfill({ json: {
    results: [], counts: { all: 0, whole_word: 0, whole_phrase: 0 }, total: 0, hasMore: false,
  } }));
  await page.locator('.heb-input').fill('10');
  const discovery = page.locator('.gematria-discovery');
  const full = discovery.getByRole('button', { name: /פסוק שלם/ });
  await full.click();
  await expect(full).toHaveAttribute('aria-pressed', 'true');
  await expect(full.locator('span')).toHaveText('0');
  await expect(discovery.locator('.match-card:not(.skeleton-card)')).toHaveCount(0);
  await expect(discovery.locator('.error-state')).toHaveCount(0);
});

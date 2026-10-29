import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || (() => {
  try { return execSync('command -v chromium', { encoding: 'utf8' }).trim(); }
  catch { return undefined; }
})();
if (systemChromium) test.use({ launchOptions: { executablePath: systemChromium } });

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
  await page.route('**/api/base-words/weekly-parsha?**', route =>
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
  await page.locator('.weekly-scan .open').first().click();
  await expect(page.locator('.tanach-page')).toBeVisible();
  await expect(page.locator('.weekly-scan')).toHaveCount(0);
});
test('weekly scan preserves typed calculator input, loads remaining pages and filters by saved word', async ({ page }) => {
  await page.route('**/api/base-words/weekly-parsha?**', route =>
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
  await page.getByRole('button', { name: 'סגור', exact: true }).click();
  await expect(page.locator('.weekly-scan')).toHaveCount(0);
  await expect(textarea).toHaveValue('שלום');
});

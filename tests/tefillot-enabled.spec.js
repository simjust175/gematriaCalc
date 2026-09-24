import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('enabled private Tefillot discovery combines sources, filters, and opens its reader', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium' || process.env.E2E_TEFILLOT_ENABLED !== 'true');
  await page.goto('/');
  await page.locator('input[type="password"]').fill(process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
  await page.locator('.heb-input').fill('44');

  const discovery = page.locator('.gematria-discovery');
  const selector = discovery.locator('.source-selector');
  await expect(discovery.locator('.source-breakdown b').nth(1)).not.toHaveText('בקרוב');
  await expect(discovery.locator('.source-badge--tefillot').first()).toBeVisible();
  await expect(discovery.locator('.source-badge--tanach').first()).toBeVisible();

  const kollelRequest = page.waitForResponse(response =>
    response.url().includes('/api/tefillot/gematria-matches')
    && new URL(response.url()).searchParams.get('value') === '45'
  );
  await discovery.locator('.kollel-toggle').click();
  expect((await kollelRequest).status()).toBe(200);

  await selector.getByRole('button', { name: 'תנ״ך', exact: true }).click();
  await expect(discovery.locator('.manual-range')).toBeVisible();
  await expect(discovery.locator('.parshah-filter')).toBeVisible();

  await selector.getByRole('button', { name: 'תפילות', exact: true }).click();
  await expect(discovery.locator('.tefillot-filter-row select')).toHaveCount(2);
  await discovery.locator('.tefillot-filter-row select').first().selectOption('weekday');
  const card = discovery.locator('.match-card:not(.skeleton-card)').first();
  await expect(card.locator('.source-badge--tefillot')).toBeVisible();
  await expect(card.locator('.citation strong')).toContainText('·');
  await card.getByRole('button', { name: 'פתח בקורא' }).click();
  await expect(page.locator('.tefillot-page .prayer-text mark')).toBeVisible();
  await expect(page.locator('.tefillot-page .source-card')).toContainText(/CC-BY|Public Domain/);
  await expect(page.locator('.tefillot-page .occasion-grid')).not.toContainText(/ראש השנה|יום כיפור|נעילה/);
});
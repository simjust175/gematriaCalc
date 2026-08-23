import { test, expect } from '@playwright/test';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}

test('calculator discovery filters and opens the exact canonical Tanach range', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  await page.locator('.heb-input').fill('בראשית');

  const discovery = page.locator('.gematria-discovery');
  await expect(discovery.getByRole('heading')).toContainText('913');
  await discovery.getByRole('button', { name: /מילה שלמה/ }).click();

  const genesis = discovery.locator('.match-card').filter({
    has: page.locator('.citation strong', { hasText: 'בראשית א:א' }),
  }).first();
  await expect(genesis).toBeVisible();
  await expect(genesis.locator('.type-label')).toHaveText('מילה שלמה');
  await genesis.getByRole('button', { name: 'פתח בקורא' }).click();

  await expect(page.locator('.verse-toolbar h2')).toContainText('בראשית א:א');
  await expect(page.locator('.verse-token--letter.verse-token--range')).toHaveCount(6);
  await expect(page.locator('.primary-value strong')).toHaveText('913');
});

test('changing target clears stale cards immediately and load more appends server results', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  const textarea = page.locator('.heb-input');
  const discovery = page.locator('.gematria-discovery');

  await textarea.fill('בראשית');
  await expect(discovery.locator('.match-card:not(.skeleton-card)').first()).toBeVisible();
  await textarea.fill('שלום');
  await expect(discovery.getByRole('heading')).toContainText('376');
  await expect(discovery.locator('.match-card:not(.skeleton-card)')).toHaveCount(0);

  await textarea.fill('א');
  await expect(discovery.locator('.load-more')).toBeVisible();
  await expect(discovery.locator('.match-card:not(.skeleton-card)')).toHaveCount(12);
  await discovery.locator('.load-more').click();
  await expect(discovery.locator('.match-card:not(.skeleton-card)')).toHaveCount(24);
});
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
  await expect(genesis.locator('.type-label')).toHaveText('מילה אחת');
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

test('calculator discovery navigates Tanach scopes with accessible listboxes while preserving the weekly shortcut', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  await page.locator('.heb-input').fill('יהוה');

  const discovery = page.locator('.gematria-discovery');
  const book = discovery.getByRole('combobox', { name: 'ספר', exact: true });
  await expect(book).toBeEnabled();
  await book.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await book.press('End');
  await book.press('Escape');
  await expect(book).toHaveAttribute('aria-expanded', 'false');

  await book.click();
  await page.getByRole('option', { name: 'בראשית', exact: true }).click();
  const parshah = discovery.getByRole('combobox', { name: 'פרשה', exact: true });
  await expect(parshah).toBeVisible();
  await parshah.click();
  await expect(page.getByRole('option', { name: 'ויצא', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'יתרו', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'ויצא', exact: true }).click();
  await expect(discovery.locator('.match-card:not(.skeleton-card)').first()).toBeVisible();
  await expect(discovery.locator('.citation strong').first()).toContainText('בראשית');

  const weekly = discovery.getByRole('button', { name: /פרשת השבוע/ });
  await weekly.click();
  await expect(weekly).toHaveAttribute('aria-pressed', 'true');
  await expect(book).toContainText('כל התנ״ך');
  await expect(parshah).toHaveCount(0);
  await book.click();
  await page.getByRole('option', { name: 'ישעיהו', exact: true }).click();
  await expect(weekly).toHaveAttribute('aria-pressed', 'false');
  const chapter = discovery.getByRole('combobox', { name: 'פרק', exact: true });
  await expect(chapter).toBeVisible();
  await chapter.click();
  await page.getByRole('option', { name: 'פרק מ', exact: true }).click();
  const verse = discovery.getByRole('combobox', { name: 'פסוק', exact: true });
  await expect(verse).toBeVisible();
  await verse.click();
  await page.getByRole('option', { name: 'פסוק ג', exact: true }).click();
  await expect(discovery.locator('.citation strong').first()).toContainText('ישעיהו מ:ג');
});

test('Tanach listbox selectors do not overflow on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.locator('.heb-input').fill('יהוה');
  const discovery = page.locator('.gematria-discovery');
  await expect(discovery.getByRole('combobox', { name: 'ספר', exact: true })).toBeEnabled();
  expect(await discovery.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
import { test, expect } from '@playwright/test';
import { toHebrewNumber } from '../src/composables/useGematria.js';
import { calculateMilui } from '../src/utils/milui.js';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function loginAndOpenCalculator(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}

test('live saved-word matches identify and highlight the matching word once', async ({ page }) => {
  await loginAndOpenCalculator(page);

  const savedText = 'קולי שמע וראה דמע';
  const createResponse = await page.request.post(new URL('/api/entries', page.url()).href, {
    data: { originalText: savedText },
  });
  expect([200, 409]).toContain(createResponse.status());
  const savedId = (await createResponse.json()).id;

  try {
    const textarea = page.locator('.heb-input');
    const matchPanel = page.locator('.match-col');
    await textarea.fill('קולי');

    await expect(matchPanel.locator('.match-item')).toHaveCount(1);
    await expect(matchPanel.locator('.match-badge')).toHaveText('התאמה בתיבה');
    await expect(matchPanel.locator('.match-text')).toHaveText(savedText);
    await expect(matchPanel.locator('.match-text__word')).toHaveCount(1);
    await expect(matchPanel.locator('.match-text__word')).toHaveText('קולי');
    await expect(matchPanel.locator('.matched-word-detail')).toContainText(/תיבה מתאימה:\s*קולי\s*·\s*146/);

    await textarea.fill('שלום');
    await expect(matchPanel.locator('.match-item')).toHaveCount(0);
  } finally {
    if (savedId) {
      const cleanup = await page.request.delete(new URL(`/api/entries/${savedId}`, page.url()).href);
      expect(cleanup.ok()).toBe(true);
    }
  }
});

test('live matching shows the dedicated full מילוי badge', async ({ page }) => {
  await loginAndOpenCalculator(page);
  const settingsResponse = await page.request.get(new URL('/api/settings/milui', page.url()).href);
  expect(settingsResponse.ok()).toBe(true);
  const settings = await settingsResponse.json();
  const savedText = 'אבג מילוי';
  const miluiValue = calculateMilui(savedText, settings.mapping).fullGematria;
  const createResponse = await page.request.post(new URL('/api/entries', page.url()).href, {
    data: { originalText: savedText },
  });
  expect(createResponse.status()).toBe(200);
  const savedId = (await createResponse.json()).id;

  try {
    await page.locator('.heb-input').fill(toHebrewNumber(miluiValue));
    const savedCard = page.locator('.match-panel:visible .match-item').filter({
      has: page.locator('.match-text', { hasText: savedText }),
    });
    await expect(savedCard).toHaveCount(1);
    await expect(savedCard.locator('.match-badge--milui')).toHaveText('גימטריית מילוי');
  } finally {
    const cleanup = await page.request.delete(new URL(`/api/entries/${savedId}`, page.url()).href);
    expect(cleanup.ok()).toBe(true);
  }
});

test('כפולות stays closed on demand, updates live, and fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAndOpenCalculator(page);
  const savedText = 'אב';
  const createResponse = await page.request.post(new URL('/api/entries', page.url()).href, {
    data: { originalText: savedText },
  });
  expect(createResponse.status()).toBe(200);
  const savedId = (await createResponse.json()).id;
  const multipleRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/multiples') {
      multipleRequests.push(request.url());
    }
  });

  try {
    const input = page.locator('.heb-input');
    const toggle = page.locator('.multiple-toggle');
    await input.fill('ו');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#multiple-discovery-panel')).toHaveCount(0);
    await page.waitForTimeout(450);
    expect(multipleRequests).toHaveLength(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.multiple-entry__phrase')).toContainText(savedText);
    await expect(page.locator('.multiple-equation').filter({ hasText: '3 × 2 = 6' })).toHaveCount(2);
    await expect(page.locator('.multiple-factor').first()).toContainText('פי ב');
    expect(multipleRequests).toHaveLength(1);

    await input.fill('יב');
    await expect(page.locator('.multiple-equation').filter({ hasText: '3 × 4 = 12' })).toHaveCount(2);
    await expect(page.locator('.multiple-equation').first()).not.toContainText('= 6');
    expect(multipleRequests).toHaveLength(2);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await input.fill('ו');
    await page.waitForTimeout(450);
    expect(multipleRequests).toHaveLength(2);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  } finally {
    const cleanup = await page.request.delete(new URL(`/api/entries/${savedId}`, page.url()).href);
    expect(cleanup.ok()).toBe(true);
  }
});
import { test, expect } from '@playwright/test';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}

test('direct numbers drive calculator, Tanach, saved matches, and base words', async ({ page }) => {
  await login(page);
  const savedResponse = await page.request.post(new URL('/api/entries', page.url()).href, {
    data: { originalText: 'תרב' },
  });
  expect([200, 409]).toContain(savedResponse.status());
  const savedPayload = await savedResponse.json();

  const baseResponse = await page.request.post(new URL('/api/base-words', page.url()).href, {
    data: { originalText: 'יהוה', sourceType: 'manual' },
  });
  expect([201, 409]).toContain(baseResponse.status());
  const basePayload = await baseResponse.json();

  try {
    const input = page.locator('.heb-input');
    await expect(page.locator('.keyboard-toggle input')).toBeChecked();
    await input.pressSequentially('602');
    await expect(input).toHaveValue('602');

    const resultSections = page.locator('.result-section');
    await expect(resultSections.nth(0)).toContainText('602');
    await expect(resultSections.nth(0)).toContainText('תרב');
    await expect(resultSections.nth(1)).toContainText('—');
    await expect(resultSections.nth(2)).toContainText('—');
    await expect(page.locator('.milui-toggle')).toBeDisabled();
    await expect(page.locator('.milui-toggle')).toContainText('מילוי זמין עבור אותיות ומילים בלבד');
    await expect(page.locator('.result-panel .save-split')).toHaveCount(0);

    const discovery = page.locator('.gematria-discovery');
    await expect(discovery.getByRole('heading')).toContainText('602');
    await expect(discovery.getByRole('button', { name: 'גימטריה' })).toHaveAttribute('aria-pressed', 'true');
    await expect(discovery.getByRole('button', { name: 'ראשי תיבות' })).toBeDisabled();
    await expect(discovery.getByRole('button', { name: 'סופי תיבות' })).toBeDisabled();

    const savedCard = page.locator('.match-panel:visible .match-item').filter({ hasText: 'תרב' });
    await expect(savedCard).toBeVisible();
    await expect(savedCard.locator('.match-badge--full')).toHaveText('גימטריה מלאה');

    await input.fill('260');
    await page.locator('.base-toggle').click();
    const baseResult = page.locator('.base-result').filter({ hasText: 'יהוה' });
    await expect(baseResult).toContainText('נכנס 10 פעמים');

    await input.fill('1,112');
    await expect(resultSections.nth(0)).toContainText('1,112');

    await input.fill('שלום 602');
    await expect(resultSections.nth(0)).toContainText('376');
    await expect(resultSections.nth(1)).not.toContainText('—');
  } finally {
    if (savedResponse.status() === 200 && savedPayload.id) {
      await page.request.delete(new URL(`/api/entries/${savedPayload.id}`, page.url()).href);
    }
    if (baseResponse.status() === 201 && basePayload.item?.id) {
      await page.request.delete(new URL(`/api/base-words/${basePayload.item.id}`, page.url()).href);
    }
  }
});

test('zero, negative, and decimal input stay out of gematria search', async ({ page }) => {
  await login(page);
  const input = page.locator('.heb-input');

  for (const invalid of ['0', '-18', '18.5', '1,12']) {
    await input.fill(invalid);
    await expect(page.getByText('נא להזין מספר שלם וחיובי')).toBeVisible();
    await expect(page.locator('.results-area')).toHaveCount(0);
    await expect(page.locator('.gematria-discovery')).toHaveCount(0);
  }

  await input.fill('18');
  await expect(page.locator('.input-validation')).toHaveCount(0);
  await expect(page.locator('.result-section').nth(0)).toContainText('18');
  await expect(page.locator('.result-section').nth(0)).toContainText('יח');
});
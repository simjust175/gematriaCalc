import { test, expect } from '@playwright/test';

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
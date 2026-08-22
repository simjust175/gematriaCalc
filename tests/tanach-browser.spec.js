import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5000';
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || (() => {
  try {
    return execSync('command -v chromium', { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
})();

if (systemChromium) {
  test.use({ launchOptions: { executablePath: systemChromium } });
}

async function loginAndOpenTanach(page) {
  if (!process.env.APP_PASSWORD) throw new Error('APP_PASSWORD is required for the signed-in browser test');
  await page.goto(baseURL);
  await page.locator('input[type="password"]').fill(process.env.APP_PASSWORD);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.getByRole('button', { name: 'תנ״ך' }).click();
  await expect(page.locator('.verse-display')).toBeVisible();
  await expect(page.locator('[data-letter-index="27"]')).toBeVisible();
}

async function centerOfLetter(page, index) {
  const box = await page.locator(`[data-letter-index="${index}"]`).boundingBox();
  if (!box) throw new Error(`Letter ${index} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function runningGematria(page) {
  const text = await page.locator('.primary-value strong').textContent();
  return Number((text || '').replace(/[^\d]/g, ''));
}

async function selectedLetterCount(page) {
  return page.locator('.verse-token--letter.verse-token--range').count();
}

test('Genesis 1:1 drag selection updates live in both directions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAndOpenTanach(page);

  const first = await centerOfLetter(page, 0);
  const endOfBereshit = await centerOfLetter(page, 5);
  const endOfBara = await centerOfLetter(page, 8);

  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await expect.poll(() => runningGematria(page)).toBe(2);
  await expect.poll(() => selectedLetterCount(page)).toBe(1);

  await page.mouse.move(endOfBereshit.x, endOfBereshit.y, { steps: 6 });
  await expect.poll(() => runningGematria(page)).toBe(913);
  await expect.poll(() => selectedLetterCount(page)).toBe(6);

  await page.mouse.move(endOfBara.x, endOfBara.y, { steps: 4 });
  await expect.poll(() => runningGematria(page)).toBe(1116);
  await expect.poll(() => selectedLetterCount(page)).toBe(9);

  await page.mouse.move(endOfBereshit.x, endOfBereshit.y, { steps: 4 });
  await expect.poll(() => runningGematria(page)).toBe(913);
  await expect.poll(() => selectedLetterCount(page)).toBe(6);

  await page.mouse.move(endOfBara.x, endOfBara.y, { steps: 4 });
  await expect.poll(() => runningGematria(page)).toBe(1116);
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() || '')).toBe('');
  await expect.poll(() => selectedLetterCount(page)).toBe(9);
  await page.screenshot({
    path: testInfo.outputPath('tanach-drag-selection.png'),
    fullPage: true,
  });

  const startOfBara = await centerOfLetter(page, 6);
  await page.mouse.move(startOfBara.x, startOfBara.y);
  await page.mouse.down();
  await page.mouse.move(endOfBara.x, endOfBara.y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => runningGematria(page)).toBe(203);
  await expect.poll(() => selectedLetterCount(page)).toBe(3);

  await page.locator('.verse-display').press('Shift+ArrowLeft');
  await expect.poll(() => selectedLetterCount(page)).toBe(4);
});

test('Tanach selection remains readable without horizontal scrolling on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAndOpenTanach(page);
  const first = await centerOfLetter(page, 0);
  const sixth = await centerOfLetter(page, 5);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(sixth.x, sixth.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => runningGematria(page)).toBe(913);
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
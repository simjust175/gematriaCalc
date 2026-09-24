import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';
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

async function loginAndOpenCalculator(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}

test('calculator input survives navigation away and back', async ({ page }) => {
  await loginAndOpenCalculator(page);

  const textarea = page.locator('.heb-input');
  await textarea.fill('שלום');
  await page.getByRole('button', { name: 'שמורים' }).click();
  await expect(page.locator('.heb-input')).toHaveCount(0);

  await page.getByRole('button', { name: 'מחשבון' }).click();
  await expect(textarea).toHaveValue('שלום');
});

test('automatic Hebrew keyboard maps physical keys and preserves calculator editing', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAndOpenCalculator(page);

  const textarea = page.locator('.heb-input');
  const automaticKeyboard = page.getByRole('checkbox', { name: 'מקלדת עברית אוטומטית' });
  await expect(automaticKeyboard).toBeChecked();
  await expect(page.locator('.empty-hint')).toHaveCount(0);
  const emptyTextareaHeight = await textarea.evaluate((element) => Math.round(element.getBoundingClientRect().height));
  expect(emptyTextareaHeight).toBeGreaterThanOrEqual(80);
  expect(emptyTextareaHeight).toBeLessThanOrEqual(90);

  await textarea.focus();
  await page.keyboard.press('KeyJ');
  await page.keyboard.press('KeyG');
  await page.keyboard.press('KeyK');
  await page.keyboard.press('KeyG');
  await page.keyboard.press('KeyK');
  await expect(textarea).toHaveValue('חעלעל');
  await expect(page.locator('.primary-num')).toHaveText('208');
  await expect(page.locator('.matches-context').first()).toContainText('התאמות לחישוב הנוכחי: 208 · רח');
  const resultSections = page.locator('.result-panel .result-section');
  await expect(page.locator('.result-panel')).toHaveCount(1);
  await expect(resultSections).toHaveCount(3);
  await expect(page.locator('.result-panel-toolbar .save-split__main')).toBeVisible();
  await expect(page.locator('.result-grid .save-split')).toHaveCount(0);
  const desktopResultLayout = await page.locator('.result-grid').evaluate((grid) => {
    const cards = [...grid.children];
    const cardBoxes = cards.map((card) => card.getBoundingClientRect());
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
      widths: cardBoxes.map(({ width }) => width),
      heights: cardBoxes.map(({ height }) => height),
    };
  });
  expect(desktopResultLayout.columns).toBe(3);
  expect(Math.max(...desktopResultLayout.widths) - Math.min(...desktopResultLayout.widths)).toBeLessThanOrEqual(1);
  expect(Math.max(...desktopResultLayout.heights) - Math.min(...desktopResultLayout.heights)).toBeLessThanOrEqual(1);

  await textarea.press('Space');
  await textarea.press('Digit1');
  await expect(textarea).toHaveValue('חעלעל 1');
  await textarea.press('Backspace');
  await expect(textarea).toHaveValue('חעלעל ');
  await textarea.press('Backspace');
  await expect(textarea).toHaveValue('חעלעל');

  await textarea.fill('שלום');
  await textarea.evaluate(element => element.setSelectionRange(2, 2));
  await page.keyboard.press('KeyF');
  await expect(textarea).toHaveValue('שלכום');

  await textarea.fill('שלום');
  await textarea.evaluate(element => element.setSelectionRange(1, 3));
  await page.keyboard.press('KeyT');
  await expect(textarea).toHaveValue('שאם');

  await textarea.fill('שלום');
  await textarea.press('Control+A');
  expect(await textarea.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([0, 4]);
  await page.keyboard.press('KeyT');
  await expect(textarea).toHaveValue('א');
  await textarea.press('Control+Z');
  await expect(textarea).toHaveValue('שלום');

  await textarea.fill('');
  await page.keyboard.insertText('ש');
  await expect(textarea).toHaveValue('ש');

  await context.grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: new URL(page.url()).origin }
  );
  await page.evaluate(() => navigator.clipboard.writeText('shalom'));
  await textarea.fill('');
  await textarea.press('Control+V');
  await expect(textarea).toHaveValue('shalom');

  await page.locator('.keyboard-toggle').click();
  await expect(automaticKeyboard).not.toBeChecked();
  await page.reload();
  await expect(automaticKeyboard).not.toBeChecked();
  await textarea.fill('');
  await textarea.press('KeyT');
  await expect(textarea).toHaveValue('t');
});
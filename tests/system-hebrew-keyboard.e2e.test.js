import { test, expect } from '@playwright/test';

const password = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function typeShalom(page, input) {
  await input.focus();
  for (const key of ['KeyA', 'KeyK', 'KeyU', 'KeyO']) {
    await page.keyboard.press(key);
  }
}

async function openCalculator(page) {
  await page.getByRole('button', { name: 'מחשבון', exact: true }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}

test('one automatic Hebrew preference controls every Hebrew text-entry surface', async ({ page, context }, testInfo) => {
  await page.goto('/');

  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.press('KeyT');
  await expect(passwordInput).toHaveValue('t');
  await passwordInput.fill(password);
  await page.getByRole('button', { name: 'כניסה' }).click();

  const calculator = page.locator('.heb-input');
  const automaticKeyboard = page.getByRole('checkbox', { name: 'מקלדת עברית אוטומטית' });
  await expect(automaticKeyboard).toBeChecked();
  await typeShalom(page, calculator);
  await expect(calculator).toHaveValue('שלום');

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: page.url() });
  await page.evaluate(() => navigator.clipboard.writeText('shalom'));
  await calculator.fill('');
  await calculator.press('Control+V');
  await expect(calculator).toHaveValue('shalom');

  await page.getByRole('button', { name: 'שמורים', exact: true }).click();
  const savedSearch = page.getByRole('searchbox', { name: 'חיפוש בספרייה' });
  await typeShalom(page, savedSearch);
  await expect(savedSearch).toHaveValue('שלום');

  const baseWordSeed = `בדיקה${Date.now()}`;
  const baseWordResponse = await page.request.post(new URL('/api/base-words', page.url()).href, {
    data: { originalText: baseWordSeed },
  });
  expect(baseWordResponse.ok()).toBe(true);
  const baseWordId = (await baseWordResponse.json()).item.id;
  try {
    await page.getByRole('button', { name: 'מילות יסוד', exact: true }).click();
    await page.getByRole('button', { name: 'הוסף מילת יסוד' }).click();
    const baseWordInput = page.locator('#base-word-input');
    await typeShalom(page, baseWordInput);
    await expect(baseWordInput).toHaveValue('שלום');
    await page.getByRole('button', { name: 'ביטול' }).click();

    await page.getByRole('button', { name: `ערוך ${baseWordSeed}` }).click();
    await baseWordInput.press('Control+A');
    await typeShalom(page, baseWordInput);
    await expect(baseWordInput).toHaveValue('שלום');
    await page.getByRole('button', { name: 'ביטול' }).click();
  } finally {
    await page.request.delete(new URL(`/api/base-words/${baseWordId}`, page.url()).href);
  }

  await page.getByRole('navigation').getByRole('button', { name: 'תנ״ך', exact: true }).click();
  const tanachSearch = page.getByRole('searchbox', { name: 'חיפוש בתנ״ך' });
  await typeShalom(page, tanachSearch);
  await expect(tanachSearch).toHaveValue('שלום');

  await openCalculator(page);
  await calculator.fill('ב');
  await page.locator('.milui-toggle').click();
  await page.getByRole('button', { name: 'שנה מילוי' }).click();
  await page.getByRole('button', { name: 'הגדרות מילוי' }).click();
  const miluiInput = page.getByRole('dialog', { name: 'הגדרות מילוי' })
    .locator('.milui-row__input')
    .first();
  await miluiInput.press('Control+A');
  await typeShalom(page, miluiInput);
  await expect(miluiInput).toHaveValue('שלום');
  await page.getByRole('button', { name: 'סגור הגדרות מילוי' }).click();

  await page.locator('.keyboard-toggle').click();
  await page.getByRole('button', { name: 'שמורים', exact: true }).click();
  await savedSearch.fill('');
  await savedSearch.press('KeyT');
  await expect(savedSearch).toHaveValue('t');

  await page.getByRole('button', { name: 'מילות יסוד', exact: true }).click();
  await page.getByRole('button', { name: 'הוסף מילת יסוד' }).click();
  const disabledBaseWordInput = page.locator('#base-word-input');
  await disabledBaseWordInput.press('KeyT');
  await expect(disabledBaseWordInput).toHaveValue('t');
  await page.getByRole('button', { name: 'ביטול' }).click();

  await page.getByRole('navigation').getByRole('button', { name: 'תנ״ך', exact: true }).click();
  await tanachSearch.fill('');
  await tanachSearch.press('KeyT');
  await expect(tanachSearch).toHaveValue('t');

  await openCalculator(page);
  await calculator.fill('');
  await calculator.press('KeyT');
  await expect(calculator).toHaveValue('t');
  await calculator.fill('ב');
  await page.locator('.milui-toggle').click();
  await page.getByRole('button', { name: 'שנה מילוי' }).click();
  await page.getByRole('button', { name: 'הגדרות מילוי' }).click();
  const disabledMiluiInput = page.getByRole('dialog', { name: 'הגדרות מילוי' })
    .locator('.milui-row__input')
    .first();
  await disabledMiluiInput.fill('');
  await disabledMiluiInput.press('KeyT');
  await expect(disabledMiluiInput).toHaveValue('t');
  await page.getByRole('button', { name: 'סגור הגדרות מילוי' }).click();

  await expect(automaticKeyboard).not.toBeChecked();
  await page.locator('.keyboard-toggle').click();
  await page.getByRole('navigation').getByRole('button', { name: 'תנ״ך', exact: true }).click();
  await tanachSearch.fill('');
  await tanachSearch.press('KeyT');
  await expect(tanachSearch).toHaveValue('א');

  const viewport = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
});
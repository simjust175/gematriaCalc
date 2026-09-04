import { test, expect } from '@playwright/test';

async function loginAndOpenTanach(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
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
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAndOpenTanach(page);

  const split = page.locator('.primary-result .save-split');
  await split.locator('.save-split__toggle').click();
  await expect(page.getByRole('menuitem', { name: 'שמור כמילת יסוד' })).toBeDisabled();
  await page.keyboard.press('Escape');

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

test('Tanach save-as stores exactly the selected range as one base word', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAndOpenTanach(page);
  const split = page.locator('.primary-result .save-split');

  const first = await centerOfLetter(page, 0);
  const endOfBereshit = await centerOfLetter(page, 5);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(endOfBereshit.x, endOfBereshit.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => runningGematria(page)).toBe(913);

  let baseWordId;
  try {
    await split.locator('.save-split__toggle').click();
    await page.getByRole('menuitem', { name: 'שמור כמילת יסוד' }).click();
    await expect(page.getByText('נוסף למילות יסוד', { exact: true })).toBeVisible();

    const response = await page.request.get(new URL('/api/base-words', page.url()).href);
    expect(response.ok()).toBe(true);
    const items = (await response.json()).items;
    const saved = items.find(item => item.normalizedText === 'בראשית' && item.sourceType === 'tanach');
    expect(saved).toBeTruthy();
    expect(saved.fullGematria).toBe(913);
    baseWordId = saved.id;

    await split.locator('.save-split__toggle').click();
    await page.getByRole('menuitem', { name: 'שמור כמילת יסוד' }).click();
    await expect(page.getByText('כבר קיים במילות יסוד', { exact: true })).toBeVisible();
  } finally {
    if (baseWordId) {
      const cleanup = await page.request.delete(new URL(`/api/base-words/${baseWordId}`, page.url()).href);
      expect(cleanup.ok()).toBe(true);
    }
  }
});

test('Tanach selection remains readable without horizontal scrolling on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
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

test('Parashah navigation and search remain available alongside structured navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAndOpenTanach(page);

  await page.locator('.search-wrap input').fill('לך לך');
  await page.getByRole('button', { name: /פרשת לך לך/ }).click();
  await expect(page.locator('.verse-toolbar h2')).toContainText('בראשית יב:א');
  await expect(page.locator('.parsha-context')).toHaveText('פרשת לך לך');

  await page.locator('.search-wrap input').fill('לך לך');
  const parshah = page.getByRole('combobox', { name: 'פרשה', exact: true });
  await parshah.click();
  await page.getByRole('option', { name: 'ויצא', exact: true }).click();
  await expect(page.locator('.verse-toolbar h2')).toContainText('בראשית כח:י');
  await expect(page.locator('.parsha-context')).toHaveText('פרשת ויצא');
  await expect(page.locator('.search-wrap input')).toHaveValue('לך לך');

  await page.getByRole('button', { name: /הבא/ }).click();
  await expect(page.locator('.verse-toolbar h2')).toContainText('בראשית כח:יא');
  await expect(page.locator('.parsha-context')).toHaveText('פרשת ויצא');

  const book = page.getByRole('combobox', { name: 'ספר', exact: true });
  await book.click();
  await page.getByRole('option', { name: 'שמות', exact: true }).click();
  await expect(page.locator('.verse-toolbar h2')).toContainText('שמות א:א');
  await expect(page.locator('.parsha-context')).toHaveCount(0);
});

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

import { test, expect } from '@playwright/test';
import { computeAll } from '../src/composables/useGematria.js';

test.use({ serviceWorkers: 'block' });
const prayer = 'שְׁמַע יִשְׂרָאֵל, ה׳ אֱלֹהֵינוּ ה׳ אֶחָד.';

async function openReader(page) {
  await page.route('**/api/auth/check', route => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/tefillot/availability', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/tefillot/catalog', route => route.fulfill({ json: {
    stats: { unit_count: 25 }, occasions: [{ slug: 'weekday', label: 'חול', services: [{
      slug: 'shacharit', label: 'שחרית', sections: [{ key: 'shema', label: 'ק״ש וברכותיה', unitCount: 25 }],
    }] }],
  } }));
  await page.route('**/api/tefillot/section?*', route => route.fulfill({ json: {
    section: Array.from({ length: 25 }, (_, index) => ({
      id: index + 1, sequence: index + 1, hebrew_text: index === 1 ? 'ברוך שם כבוד מלכותו לעולם ועד' : prayer,
      source_work: 'Browser fixture', source_version: 'Test', license: 'Public Domain', source_reference: 'Test',
    })),
  } }));
  await page.goto('/');
  await page.locator('.app-header').getByRole('button', { name: 'תפילות', exact: true }).click();
  await expect(page.locator('.prayer-text p')).toHaveCount(25);
  await page.locator('.prayer-text p').first().scrollIntoViewIfNeeded();
}

async function selectText(page, selector = '.prayer-text p', start = 0, end = null, endSelector = null) {
  return page.evaluate(({ selector, start, end, endSelector }) => {
    const first = document.querySelector(selector);
    const last = document.querySelector(endSelector || selector);
    function boundary(element, offset) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let remaining = offset;
      while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) return [node, remaining];
        remaining -= node.textContent.length;
      }
      throw new Error('Invalid test selection offset');
    }
    const range = document.createRange();
    range.setStart(...boundary(first, start));
    range.setEnd(...boundary(last, end ?? last.textContent.length));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return selection.toString();
  }, { selector, start, end, endSelector });
}

async function calculate(page) {
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  await page.getByRole('button', { name: 'חשב גימטריה' }).click();
  await expect(page.getByRole('dialog', { name: 'גימטריית הבחירה' })).toBeVisible();
}

async function assertResult(page, text) {
  const expected = computeAll(text);
  const dialog = page.getByRole('dialog', { name: 'גימטריית הבחירה' });
  await expect(dialog.locator('.selection-copy')).toHaveText(text, { useInnerText: false });
  expect(await dialog.locator('.selection-copy').textContent()).toBe(text);
  await expect(dialog.locator('.full-number')).toHaveText(expected.fullGematria.toLocaleString('he-IL'));
  await expect(dialog.locator('.inclusive-value strong')).toHaveText((expected.fullGematria + 1).toLocaleString('he-IL'));
  if (expected.words.length > 1) {
    await expect(dialog.locator('.derived-row').nth(0).locator('.derived-letters')).toHaveText(expected.initials);
    await expect(dialog.locator('.derived-row').nth(0).locator('.derived-number')).toHaveText(expected.initialsGematria.toLocaleString('he-IL'));
    await expect(dialog.locator('.derived-row').nth(1).locator('.derived-letters')).toHaveText(expected.finals);
    await expect(dialog.locator('.derived-row').nth(1).locator('.derived-number')).toHaveText(expected.finalsGematria.toLocaleString('he-IL'));
  } else await expect(dialog.locator('.derived-row')).toHaveCount(0);
}

test('reader is clean until a valid prayer selection; single word matches calculator', async ({ page }) => {
  await openReader(page);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  const text = await selectText(page, '.prayer-text p', 0, prayer.indexOf(' '));
  await calculate(page);
  await assertResult(page, text);
});

test('multiword pointed prayer and punctuation match canonical calculator fields', async ({ page }, testInfo) => {
  await openReader(page);
  const text = await selectText(page);
  await calculate(page);
  await assertResult(page, text);
  await page.screenshot({ path: testInfo.outputPath('prayer-selection-result.png'), animations: 'disabled' });
});

test('partial word retains the exact visible fragment, without expanding to whole words', async ({ page }) => {
  await openReader(page);
  const text = await selectText(page, '.prayer-text p', 0, 5);
  await calculate(page);
  await assertResult(page, text);
  expect(computeAll(text).fullGematria).toBe(340);
});

test('adjacent inline text nodes and adjacent prayer paragraphs remain contiguous', async ({ page }) => {
  await openReader(page);
  await page.locator('.prayer-text p').first().evaluate(element => {
    element.innerHTML = 'שְׁמַע <mark>יִשְׂרָאֵל</mark> ה׳';
  });
  let text = await selectText(page);
  await calculate(page);
  await assertResult(page, text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  text = await selectText(page, '.prayer-text p', 0, null, '.prayer-text p:nth-child(2)');
  await calculate(page);
  await assertResult(page, text);
});

test('sidebar, header, source UI and mixed prayer/chrome selections never show an action', async ({ page }) => {
  await openReader(page);
  for (const selector of ['.navigator h1', '.reader-heading h2', '.app-header', '.source-card summary']) {
    await selectText(page, selector);
    await page.waitForTimeout(250);
    await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  }
  await selectText(page, '.reader-heading h2', 0, 5, '.prayer-text p');
  await page.waitForTimeout(250);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('whitespace, punctuation and intervening UI are rejected', async ({ page }) => {
  await openReader(page);
  await page.locator('.prayer-text p').first().evaluate(element => { element.textContent = ' \n ,׳ '; });
  await selectText(page);
  await page.waitForTimeout(250);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  await page.locator('.prayer-text p').first().evaluate(element => { element.innerHTML = 'שמע <button>ישראל</button> אחד'; });
  await selectText(page);
  await page.waitForTimeout(250);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('new selection resets results; collapsed selection, Escape and outside clicks dismiss cleanly', async ({ page }) => {
  await openReader(page);
  await selectText(page);
  await calculate(page);
  await page.waitForTimeout(350);
  await selectText(page, '.prayer-text p', 0, 5);
  await expect(page.getByRole('dialog', { name: 'גימטריית הבחירה' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  await selectText(page);
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  await selectText(page);
  await calculate(page);
  await page.locator('.reader-heading').click();
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('viewport resizing clamps the result; scrolling dismisses instead of detaching it', async ({ page }) => {
  await openReader(page);
  await selectText(page);
  await calculate(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect.poll(async () => {
    const bounds = await page.locator('[data-selection-popover]').boundingBox();
    return Boolean(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 768 && bounds.y + bounds.height <= 1024);
  }).toBe(true);
  await page.evaluate(() => window.scrollBy(0, 100));
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('touch selection preserves native selection and exposes a viewport-contained action', async ({ page }) => {
  await openReader(page);
  const text = await selectText(page);
  await page.locator('.prayer-text').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 3 });
  await page.locator('.prayer-text').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 3 });
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  expect(await page.evaluate(() => window.getSelection().toString())).toBe(text);
  const bounds = await page.locator('[data-selection-popover]').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  await calculate(page);
  await assertResult(page, text);
});

test('long contiguous ranges retain exact display text and do not overflow the result card', async ({ page }) => {
  await openReader(page);
  const text = await selectText(page, '.prayer-text p', 0, null, '.prayer-text p:nth-child(25)');
  await calculate(page);
  await assertResult(page, text);
  await expect.poll(async () => page.locator('[data-selection-popover]').evaluate(element =>
    element.scrollWidth <= element.clientWidth + 1
    && element.getBoundingClientRect().bottom <= window.innerHeight + 1,
  )).toBe(true);
});

test('subtle save reuses the existing originalText API and supports duplicate and retry states', async ({ page }) => {
  await openReader(page);
  let status = 503;
  let payload;
  await page.route('**/api/entries', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status, json: {} });
  });
  const text = await selectText(page);
  await calculate(page);
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('לא ניתן לשמור');
  status = 409;
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await expect(page.getByRole('button', { name: 'כבר שמור' })).toBeDisabled();
  expect(payload).toEqual({ originalText: text });
  await page.waitForTimeout(350);
  const fragment = await selectText(page, '.prayer-text p', 0, 5);
  await calculate(page);
  status = 201;
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await expect(page.getByRole('button', { name: 'נשמר', exact: true })).toBeDisabled();
  expect(payload).toEqual({ originalText: fragment });
});

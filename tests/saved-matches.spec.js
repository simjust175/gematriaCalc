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

test('מילות יסוד stays closed on demand, shows exact compact results, and fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAndOpenCalculator(page);
  const baseText = 'יהוה';
  const createResponse = await page.request.post(new URL('/api/base-words', page.url()).href, {
    data: { originalText: baseText, sourceType: 'manual' },
  });
  expect(createResponse.status()).toBe(201);
  const baseWordId = (await createResponse.json()).item.id;
  const matchRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/base-words/matches') {
      matchRequests.push(request.url());
    }
  });

  try {
    const input = page.locator('.heb-input');
    const toggle = page.locator('.base-toggle');
    await input.fill('רס');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.base-results')).toHaveCount(0);
    await page.waitForTimeout(200);
    expect(matchRequests).toHaveLength(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const result = page.locator('.base-result').filter({ hasText: baseText });
    await expect(result.getByText(baseText, { exact: true })).toBeVisible();
    await expect(result).toContainText('נכנס 10 פעמים (י)');
    await expect(page.locator('.multiple-equation, .multiple-source-label')).toHaveCount(0);
    const compactLayout = await page.locator('.base-disclosure').evaluate((panel) => {
      const row = panel.querySelector('.base-result');
      const toggle = panel.querySelector('.base-toggle');
      return {
        panelHeight: panel.getBoundingClientRect().height,
        resultHeight: row.getBoundingClientRect().height,
        toggleHeight: toggle.getBoundingClientRect().height,
        direction: getComputedStyle(row).flexDirection,
      };
    });
    expect(compactLayout.resultHeight).toBeGreaterThanOrEqual(55);
    expect(compactLayout.resultHeight).toBeLessThanOrEqual(70);
    expect(compactLayout.panelHeight).toBeLessThanOrEqual(compactLayout.toggleHeight + 75);
    expect(compactLayout.direction).toBe('column');
    expect(matchRequests).toHaveLength(1);

    await input.fill('יהוה');
    await expect(result).toContainText('נכנס 1 פעם (א)');
    expect(matchRequests).toHaveLength(2);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await input.fill('רס');
    await page.waitForTimeout(200);
    expect(matchRequests).toHaveLength(2);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  } finally {
    const cleanup = await page.request.delete(new URL(`/api/base-words/${baseWordId}`, page.url()).href);
    expect(cleanup.ok()).toBe(true);
  }
});

test('calculator save-as stays separate and management supports edit and delete', async ({ page }) => {
  await loginAndOpenCalculator(page);
  const token = `אבג${Date.now().toString().replaceAll('0', 'א').replaceAll('1', 'ב').replaceAll('2', 'ג').replaceAll('3', 'ד').replaceAll('4', 'ה').replaceAll('5', 'ו').replaceAll('6', 'ז').replaceAll('7', 'ח').replaceAll('8', 'ט').replaceAll('9', 'י')}`;
  const updated = `${token} שמע`;
  let baseWordId;
  let savedEntryId;

  try {
    await page.locator('.heb-input').fill(token);
    const split = page.locator('.result-panel .save-split');
    const splitLayout = await split.evaluate((control) => {
      const main = control.querySelector('.save-split__main').getBoundingClientRect();
      const toggle = control.querySelector('.save-split__toggle').getBoundingClientRect();
      return {
        heightDifference: Math.abs(main.height - toggle.height),
        segmentGap: Math.abs(main.left - toggle.right),
        mainWidth: main.width,
        toggleWidth: toggle.width,
      };
    });
    expect(splitLayout.heightDifference).toBeLessThanOrEqual(1);
    expect(splitLayout.segmentGap).toBeLessThanOrEqual(1);
    expect(splitLayout.toggleWidth).toBeLessThan(splitLayout.mainWidth);
    await split.locator('.save-split__main').click();
    await expect(split.locator('.save-split__main')).toHaveText('כבר שמור');

    const savedEntriesResponse = await page.request.get(
      new URL(`/api/entries?search=${encodeURIComponent(token)}`, page.url()).href
    );
    expect(savedEntriesResponse.ok()).toBe(true);
    const savedPayload = await savedEntriesResponse.json();
    const savedEntry = (savedPayload.entries || []).find(
      item => item.original_text === token || item.originalText === token
    );
    expect(savedEntry).toBeTruthy();
    savedEntryId = savedEntry.id;

    const beforeBaseWords = await page.request.get(new URL('/api/base-words', page.url()).href);
    expect(beforeBaseWords.ok()).toBe(true);
    expect((await beforeBaseWords.json()).items.some(item => item.originalText === token)).toBe(false);

    await split.locator('.save-split__toggle').click();
    await page.getByRole('menuitem', { name: 'שמור כמילת יסוד' }).click();
    await expect(page.getByText('נוסף למילות יסוד', { exact: true })).toBeVisible();
    await expect(split.locator('.save-split__main')).toHaveText('כבר שמור');

    const baseWordsResponse = await page.request.get(new URL('/api/base-words', page.url()).href);
    expect(baseWordsResponse.ok()).toBe(true);
    const created = (await baseWordsResponse.json()).items.find(item => item.originalText === token);
    expect(created).toBeTruthy();
    baseWordId = created.id;

    await page.getByRole('button', { name: 'מילות יסוד', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'מילות יסוד' })).toBeVisible();
    const row = page.locator('.word-row').filter({ hasText: token });
    await row.getByRole('button', { name: `ערוך ${token}` }).click();
    await page.locator('#base-word-input').fill(updated);
    await page.getByRole('dialog').getByRole('button', { name: 'שמור', exact: true }).click();
    await expect(page.locator('.word-row').filter({ hasText: updated })).toBeVisible();

    const updatedRow = page.locator('.word-row').filter({ hasText: updated });
    await updatedRow.getByRole('button', { name: `מחק ${updated}` }).click();
    const deleteDialog = page.getByRole('alertdialog', { name: 'למחוק את מילת היסוד הזו?' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'מחיקה', exact: true }).click();
    await expect(updatedRow).toHaveCount(0);
    baseWordId = null;
  } finally {
    if (baseWordId) {
      await page.request.delete(new URL(`/api/base-words/${baseWordId}`, page.url()).href);
    }
    if (savedEntryId) {
      await page.request.delete(new URL(`/api/entries/${savedEntryId}`, page.url()).href);
    }
  }
});
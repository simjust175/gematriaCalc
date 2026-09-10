import { test, expect } from '@playwright/test';
import { calculateMilui } from '../src/utils/milui.js';
import { normalize } from '../src/composables/useGematria.js';

test.use({ serviceWorkers: 'block' });

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function signInAndOpenTanach(page) {
  await page.goto('/');

  const unauthenticatedResponse = await page.context().request.get(
    new URL('/api/tanach/books', page.url()).href
  );
  expect(unauthenticatedResponse.status()).toBe(401);

  const password = page.getByPlaceholder('סיסמה...');
  await expect(password).toBeFocused();
  await password.fill(e2ePassword);

  const loginResponsePromise = page.waitForResponse(response =>
    response.url().endsWith('/api/auth/login')
      && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect((await loginResponsePromise).status()).toBe(200);

  const tanachNavigation = page.getByRole('button', { name: 'תנ״ך', exact: true });
  await expect(tanachNavigation).toBeVisible();
  await tanachNavigation.click();

  await expect(page.locator('.verse-toolbar h2')).toHaveText('בראשית א:א');
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuemax', '28');
}

async function expectResponsiveReaderLayout(page, projectName) {
  const [navigator, reader, summary] = await Promise.all([
    page.locator('.navigator-card').boundingBox(),
    page.locator('.reader-column').boundingBox(),
    page.locator('.summary-column').boundingBox(),
  ]);

  expect(navigator).not.toBeNull();
  expect(reader).not.toBeNull();
  expect(summary).not.toBeNull();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasHorizontalOverflow).toBe(false);

  if (projectName === 'mobile-chromium') {
    expect(reader.y).toBeLessThan(navigator.y);
    expect(reader.width).toBeGreaterThan(340);
    expect(navigator.width).toBeGreaterThan(340);
  } else {
    expect(Math.abs(navigator.y - reader.y)).toBeLessThan(10);
    expect(reader.x).toBeGreaterThan(navigator.x);
    expect(summary.x).toBeGreaterThan(reader.x);
  }
}

test('signed-in Tanach reader supports cursor, navigation, search, and cited saves', async ({ page }, testInfo) => {
  let savedId;

  try {
    await signInAndOpenTanach(page);
    await expectResponsiveReaderLayout(page, testInfo.project.name);

    const slider = page.getByRole('slider');
    const letters = page.locator('.verse-token--letter');
    const runningTotal = page.locator('.primary-value strong');
    const range = page.locator('.range-mode b');

    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await expect(runningTotal).toHaveText('2');
    await expect(range).toHaveText('1–1');

    await letters.nth(5).click();
    await expect(slider).toHaveAttribute('aria-valuenow', '6');
    await expect(runningTotal).toHaveText('400');
    await expect(range).toHaveText('6–6');

    await slider.press('ArrowLeft');
    await expect(slider).toBeFocused();
    await expect(slider).toHaveAttribute('aria-valuenow', '7');
    await expect(runningTotal).toHaveText('2');
    await expect(range).toHaveText('7–7');

    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '6');
    await expect(runningTotal).toHaveText('400');
    await expect(range).toHaveText('6–6');

    await slider.press('Shift+ArrowLeft');
    await expect(range).toHaveText('6–7');
    await expect(runningTotal).toHaveText('402');

    await letters.nth(0).click();
    await expect(range).toHaveText('1–1');
    await expect(runningTotal).toHaveText('2');
    for (let index = 0; index < 5; index += 1) {
      await slider.press('Shift+ArrowLeft');
    }
    await expect(range).toHaveText('1–6');
    await expect(runningTotal).toHaveText('913');

    await page.getByTitle('הפסוק הבא').click();
    await expect(page.locator('.verse-toolbar h2')).toHaveText('בראשית א:ב');
    await expect(slider).toBeFocused();
    await expect(slider).toHaveAttribute('aria-valuenow', '1');

    const book = page.getByRole('combobox', { name: 'ספר', exact: true });
    await book.click();
    await page.getByRole('option', { name: 'ישעיהו', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'פרשה', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'פרק', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'פסוק', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'פרק', exact: true }).click();
    await page.getByRole('option', { name: 'מ', exact: true }).click();
    await expect(page.locator('.verse-toolbar h2')).toHaveText('ישעיהו מ:א');
    await page.getByRole('combobox', { name: 'פסוק', exact: true }).click();
    await page.getByRole('option', { name: 'ג', exact: true }).click();
    await expect(page.locator('.verse-toolbar h2')).toHaveText('ישעיהו מ:ג');

    await book.click();
    await page.getByRole('option', { name: 'בראשית', exact: true }).click();
    await expect(page.locator('.verse-toolbar h2')).toHaveText('בראשית א:א');

    const searchResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/tanach/search?')
        && response.request().method() === 'GET'
    );
    await page.getByRole('searchbox', { name: 'חיפוש בתנ״ך' }).fill('בראשית א א');
    await expect((await searchResponsePromise).status()).toBe(200);

    const genesisOneOneResult = page.locator('.search-results button')
      .filter({ hasText: 'בראשית א:א' })
      .first();
    await expect(genesisOneOneResult).toBeVisible();
    await genesisOneOneResult.click();
    await expect(page.locator('.verse-toolbar h2')).toHaveText('בראשית א:א');
    await expect(slider).toBeFocused();

    const selectedEnd = testInfo.project.name === 'mobile-chromium' ? 19 : 27;
    const saveButton = page.getByRole('button', { name: 'שמור טווח' });
    const matchResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/matches?')
        && response.request().method() === 'GET'
    );
    await letters.nth(0).click();
    for (let index = 0; index < selectedEnd; index += 1) {
      await slider.press('Shift+ArrowLeft');
    }
    await expect((await matchResponsePromise).status()).toBe(200);
    await expect(range).toHaveText(`1–${selectedEnd + 1}`);
    await expect(saveButton).toBeEnabled();

    const saveRequestPromise = page.waitForRequest(request =>
      request.url().endsWith('/api/entries')
        && request.method() === 'POST'
    );
    const saveResponsePromise = page.waitForResponse(response =>
      response.url().endsWith('/api/entries')
        && response.request().method() === 'POST'
    );
    await saveButton.click();

    const saveRequest = await saveRequestPromise;
    const saveResponse = await saveResponsePromise;
    const saveBody = saveRequest.postDataJSON();

    expect(saveResponse.status()).toBe(200);
    expect(saveBody.tanachContext).toEqual({
      bookSlug: 'Genesis',
      chapter: 1,
      verse: 1,
      start: 0,
      end: selectedEnd,
    });
    await expect(page.getByRole('button', { name: /נשמר|כבר שמור/ })).toBeDisabled();

    savedId = (await saveResponse.json()).id;
    expect(savedId).toBeTruthy();

    await page.getByRole('button', { name: 'שמורים', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'שמורים' })).toBeVisible();

    const savedCard = page.locator('.entry-card')
      .filter({ hasText: saveBody.originalText })
      .first();
    await expect(savedCard).toBeVisible();
    await expect(savedCard.locator('.tanach-reference')).toContainText('בראשית א:א');
    await savedCard.locator('.entry-header').click();
    await expect(page.locator(`[data-detail-entry-id="${savedId}"] .detail-reference`))
      .toContainText(`אותיות 1–${selectedEnd + 1}`);

    const deleteUrl = new URL(`/api/entries/${savedId}`, page.url()).href;
    const cleanup = await page.context().request.delete(deleteUrl);
    expect(cleanup.ok()).toBe(true);
    savedId = undefined;

    const logoutResponsePromise = page.waitForResponse(response =>
      response.url().endsWith('/api/auth/logout')
        && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'אפשרויות נוספות' }).click();
    await page.getByRole('button', { name: 'יציאה', exact: true }).click();
    await expect((await logoutResponsePromise).status()).toBe(200);
    await expect(page.getByPlaceholder('סיסמה...')).toBeVisible();

    const loggedOutResponse = await page.context().request.get(
      new URL('/api/tanach/books', page.url()).href
    );
    expect(loggedOutResponse.status()).toBe(401);
  } finally {
    if (savedId) {
      const deleteUrl = new URL(`/api/entries/${savedId}`, page.url()).href;
      const cleanup = await page.context().request.delete(deleteUrl);
      expect(cleanup.ok()).toBe(true);
    }
  }
});

test('Tanach reader מילוי follows the exact selection and selected-save sends its citation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await signInAndOpenTanach(page);

  const summary = page.getByRole('button', { name: /מילוי/ });
  await expect(summary).toBeDisabled();
  await expect(summary).toContainText('בחר אותיות או מילים לחישוב מילוי');

  const settingsResponse = await page.request.get(new URL('/api/settings/milui', page.url()).href);
  expect(settingsResponse.ok()).toBe(true);
  const { mapping } = await settingsResponse.json();
  const letters = page.locator('.verse-token--letter');
  const slider = page.getByRole('slider');

  await letters.nth(0).click();
  const singleLetterText = await letters.nth(0).textContent();
  const singleLetterMilui = calculateMilui(singleLetterText, mapping);
  await expect(summary).toBeEnabled();
  await expect(summary.locator('.tanach-milui-summary__value b'))
    .toHaveText(String(singleLetterMilui.fullGematria));

  await summary.click();
  const panel = page.locator('#tanach-milui-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(singleLetterMilui.expandedText);
  await expect(panel).toContainText(
    `${singleLetterMilui.fillingOnlyGematria} · ${singleLetterMilui.fillingOnlyHebrewNumber}`
  );

  for (let index = 0; index < 13; index += 1) {
    await slider.press('Shift+ArrowLeft');
  }
  const selectedText = (await Promise.all(
    Array.from({ length: 14 }, (_, index) => letters.nth(index).textContent())
  )).join('');
  const wordMilui = calculateMilui(selectedText, mapping);
  await expect(summary.locator('.tanach-milui-summary__value b'))
    .toHaveText(String(wordMilui.fullGematria));
  await expect(panel).toContainText(wordMilui.expandedText);

  let saveSelectedBody;
  await page.route('**/api/milui-interpretations/save-selected', async route => {
    saveSelectedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        savedEntry: { id: 999999, created: true },
        formIds: ['primary', 'av'],
        created: 1,
        existing: 0,
        interpretations: [],
      }),
    });
  });
  await panel.locator('.milui-additional__row').first().click();
  await panel.getByRole('button', { name: 'שמור נבחרים (1)' }).click();
  await expect(panel.getByRole('button', { name: 'נשמרו (1)' })).toBeDisabled();
  expect(normalize(saveSelectedBody.originalText).replace(/\s+/g, ''))
    .toBe(normalize(selectedText).replace(/\s+/g, ''));
  expect(saveSelectedBody.formIds).toEqual(['av']);
  expect(saveSelectedBody.tanachContext).toEqual({
    bookSlug: 'Genesis',
    chapter: 1,
    verse: 1,
    start: 0,
    end: 13,
  });
});

test('Tanach reader can retry an initial מילוי settings failure', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  let settingsRequests = 0;
  await page.route('**/api/settings/milui', async route => {
    settingsRequests += 1;
    if (settingsRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'temporarily_unavailable' }),
      });
      return;
    }
    await route.continue();
  });

  await signInAndOpenTanach(page);
  await expect(page.getByRole('alert')).toContainText('לא ניתן לטעון את הגדרות המילוי');
  await page.getByRole('button', { name: 'נסה שוב' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(settingsRequests).toBe(2);

  await page.locator('.verse-token--letter').first().click();
  await expect(page.getByRole('button', { name: /מילוי/ })).toBeEnabled();
});
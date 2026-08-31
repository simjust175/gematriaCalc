import { test, expect } from '@playwright/test';

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
    await page.getByTitle('יציאה').click();
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
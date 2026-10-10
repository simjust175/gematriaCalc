import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.skip(process.env.E2E_TEFILLOT_SAVES !== 'true', 'Requires the disposable save-schema migration');

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}
async function clean(page) {
  // page.request shares the authenticated disposable server, never the live app.
  const response = await page.request.get('/api/entries?limit=100');
  expect(response.ok()).toBe(true);
  for (const entry of (await response.json()).entries) {
    expect((await page.request.delete(`/api/entries/${entry.id}`)).ok()).toBe(true);
  }
}
async function discover(page, corpus, input = 'דם') {
  await page.locator('.app-header').getByRole('button', { name: 'מחשבון', exact: true }).click();
  await page.locator('.heb-input').fill(input);
  const discovery = page.locator('.gematria-discovery');
  await discovery.locator('.source-selector').getByRole('button', {
    name: corpus === 'tefillot' ? 'תפילות' : 'תנ״ך', exact: true,
  }).click();
  const card = discovery.locator('.match-card:not(.skeleton-card)').filter({
    has: page.locator(`.source-badge--${corpus}`),
  }).first();
  await expect(card).toBeVisible();
  return card;
}

for (const input of ['דם', '44']) {
  test(`two independent Tefillot match saves persist, refresh, and remove separately for ${input}`, async ({ page }, testInfo) => {
    await login(page);
    await clean(page);
    await discover(page, 'tefillot', input);
    const cards = page.locator('.match-card:not(.skeleton-card)').filter({ has: page.locator('.source-badge--tefillot') });
    await expect(cards.nth(1)).toBeVisible();
    const saved = [];
    for (let index = 0; index < 2; index++) {
      const saving = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/entries/curated-matches');
      await cards.nth(index).getByRole('button', { name: 'שמור התאמה', exact: true }).click();
      const response = await saving;
      expect(response.status()).toBe(200);
      saved.push(await response.json());
      await expect(cards.nth(index).getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
      await expect(cards.nth(index)).toHaveClass(/curated-saved-card/);
      await expect(cards.nth(0).getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
    }
    expect(saved[0].parentId).toBe(saved[1].parentId);
    await expect(cards.filter({ has: page.getByRole('button', { name: 'נבחרה', exact: true }) })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`two-saved-prayer-matches-${input}.png`), animations: 'disabled' });
    await page.reload();
    await discover(page, 'tefillot', input);
    for (let index = 0; index < 2; index++) {
      await expect(cards.nth(index).getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
      await expect(cards.nth(index)).toHaveClass(/curated-saved-card/);
    }
    await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
    const parent = page.locator(`[data-entry-id="${saved[0].parentId}"]`);
    await expect(parent).toContainText('2 התאמות שמורות');
    await parent.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
    const children = page.locator(`[data-detail-entry-id="${saved[0].parentId}"] .curated-match`);
    await expect(children).toHaveCount(2);
    await children.nth(0).getByRole('button', { name: 'הסר', exact: true }).click();
    const removing = page.waitForResponse(response => response.request().method() === 'DELETE'
      && response.url().includes(`/curated-matches/${saved[0].matches[0].id}?source=tefillot`));
    await children.nth(0).getByRole('button', { name: 'אישור', exact: true }).click();
    expect((await removing).ok()).toBe(true);
    await expect(children).toHaveCount(1);
    await expect(parent).toContainText('1 התאמות שמורות');
    await discover(page, 'tefillot', input);
    await expect(cards.nth(0).getByRole('button', { name: 'שמור התאמה', exact: true })).toBeEnabled();
    await expect(cards.nth(0)).not.toHaveClass(/curated-saved-card|curated-selected-card/);
    await expect(cards.nth(1).getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
    await expect(cards.nth(1)).toHaveClass(/curated-saved-card/);
    await page.reload();
    await discover(page, 'tefillot', input);
    await expect(cards.nth(0).getByRole('button', { name: 'שמור התאמה', exact: true })).toBeEnabled();
    await expect(cards.nth(1).getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
    await clean(page);
  });
}

test('Tefillot failed single save shows pending/error, never false selection, then retries against the real API', async ({ page }) => {
  await login(page);
  await clean(page);
  const card = await discover(page, 'tefillot', '44');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/entries/curated-matches', async route => {
    await pending;
    await route.fulfill({ status: 503, json: { error: 'tefillot_unavailable' } });
  });
  await card.getByRole('button', { name: 'שמור התאמה', exact: true }).click();
  await expect(card.getByRole('button', { name: 'שומר…', exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'שומר…', exact: true })).toHaveAttribute('aria-busy', 'true');
  await expect(card).not.toHaveClass(/curated-saved-card|curated-selected-card/);
  await expect(card.getByRole('button', { name: 'נבחרה', exact: true })).toHaveCount(0);
  release();
  await expect(card.getByRole('alert')).toContainText('שמירת תפילות אינה זמינה');
  await expect(card.getByRole('button', { name: 'שמור התאמה', exact: true })).toBeEnabled();
  await expect(card).not.toHaveClass(/curated-saved-card|curated-selected-card/);
  const entries = await page.request.get('/api/entries?parentOriginalText=44');
  expect((await entries.json()).entries).toHaveLength(0);
  await page.unroute('**/api/entries/curated-matches');
  const saving = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/entries/curated-matches');
  await card.getByRole('button', { name: 'שמור התאמה', exact: true }).click();
  expect((await saving).ok()).toBe(true);
  await expect(card.getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expect(card).toHaveClass(/curated-saved-card/);
  await clean(page);
});

test('Tefillot נבחרה is reserved for explicit bulk selection and becomes saved only after commit', async ({ page }) => {
  await login(page);
  await clean(page);
  await discover(page, 'tefillot', '44');
  const discovery = page.locator('.gematria-discovery');
  const cards = discovery.locator('.match-card:not(.skeleton-card)');
  let requests = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/entries/curated-matches') requests++;
  });
  await discovery.getByRole('button', { name: 'בחירה מרובה', exact: true }).click();
  for (let index = 0; index < 2; index++) {
    await cards.nth(index).getByRole('button', { name: 'שמור התאמה', exact: true }).click();
    await expect(cards.nth(index).getByRole('button', { name: 'נבחרה', exact: true })).toBeEnabled();
    await expect(cards.nth(index)).toHaveClass(/curated-selected-card/);
    await expect(cards.nth(index)).not.toHaveClass(/curated-saved-card/);
  }
  expect(requests).toBe(0);
  await discovery.getByRole('button', { name: 'שמור התאמות נבחרות', exact: true }).click();
  for (let index = 0; index < 2; index++) {
    await expect(cards.nth(index).getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
    await expect(cards.nth(index)).toHaveClass(/curated-saved-card/);
    await expect(cards.nth(index)).not.toHaveClass(/curated-selected-card/);
  }
  expect(requests).toBe(1);
  await clean(page);
});
for (const corpus of ['tefillot', 'tanach']) {
  test(`${corpus} result range and match save, duplicate state survives refresh, library reopen and remove`, async ({ page }, testInfo) => {
    await login(page);
    await clean(page);
    let card = await discover(page, corpus);
    const rangeResponse = page.waitForResponse(response =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/entries');
    await card.getByRole('button', { name: 'שמור טווח', exact: true }).click();
    const rangeSave = await rangeResponse;
    expect(rangeSave.ok()).toBe(true);
    const rangeId = (await rangeSave.json()).id;
    const rangePayload = rangeSave.request().postDataJSON();
    const text = rangePayload.originalText;
    await expect(card.getByRole('button', { name: 'נשמר', exact: true })).toBeDisabled();
    const duplicate = await page.request.post('/api/entries', { data: rangePayload });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).id).toBe(rangeId);
    const matchResponse = page.waitForResponse(response =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/entries/curated-matches');
    await card.getByRole('button', { name: 'שמור התאמה', exact: true }).click();
    const matchSave = await matchResponse;
    expect(matchSave.ok()).toBe(true);
    const parentId = (await matchSave.json()).parentId;
    await expect(card.getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
    await page.reload();
    card = await discover(page, corpus);
    await expect(card.locator('mark')).toHaveText(text);
    await expect(card.getByRole('button', { name: 'נשמר', exact: true })).toBeDisabled();
    await expect(card.getByRole('button', { name: 'נשמרה', exact: true })).toBeDisabled();
    await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
    const parent = page.locator(`[data-entry-id="${parentId}"]`);
    await expect(parent).toContainText('1 התאמות שמורות');
    await parent.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
    const detail = page.locator(`[data-detail-entry-id="${parentId}"]`);
    const child = detail.locator('.curated-match');
    await expect(child).toHaveCount(1);
    await expect(child).toContainText(text);
    if (corpus === 'tefillot') {
      const listed = (await (await page.request.get('/api/entries?limit=100')).json()).entries;
      const context = listed.find(entry => entry.id === rangeId).tefillotContext;
      await expect(child).toContainText('תפילות');
      for (const field of ['occasionLabel', 'serviceLabel', 'sectionLabel', 'sourceReference']) {
        await expect(child).toContainText(context[field]);
      }
      await page.screenshot({ path: testInfo.outputPath('prayer-saved-library.png'), animations: 'disabled' });
    }
    await child.getByRole('button', { name: 'פתח בקורא', exact: true }).click();
    if (corpus === 'tefillot') {
      await expect(page.locator('.tefillot-page .prayer-text mark')).toHaveText(text);
    } else {
      await expect(page.locator('.tanach-page')).toBeVisible();
      await expect(page.locator('.verse-toolbar h2')).not.toBeEmpty();
    }
    await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
    if (corpus === 'tefillot') {
      await page.locator(`[data-entry-id="${rangeId}"]`).getByRole('button', { name: 'פתח פירוט', exact: true }).click();
      const rangeDetail = page.locator(`[data-detail-entry-id="${rangeId}"]`);
      await rangeDetail.getByRole('button', { name: 'פתח בתפילה', exact: true }).click();
      await expect(page.locator('.tefillot-page .prayer-text mark')).toHaveText(text);
      await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
    }
    await parent.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
    await child.getByRole('button', { name: 'הסר', exact: true }).click();
    const removeResponse = page.waitForResponse(response =>
      response.request().method() === 'DELETE' && response.url().includes('/curated-matches/'));
    await child.getByRole('button', { name: 'אישור', exact: true }).click();
    expect((await removeResponse).ok()).toBe(true);
    await expect(child).toHaveCount(0);
    await expect(parent).toBeVisible();
    const rangeCard = page.locator(`[data-entry-id="${rangeId}"]`);
    await rangeCard.getByRole('button', { name: /^פעולות עבור/ }).click();
    await rangeCard.getByRole('menuitem', { name: 'מחק', exact: true }).click();
    const deletion = page.waitForResponse(response =>
      response.request().method() === 'DELETE' && new URL(response.url()).pathname === `/api/entries/${rangeId}`);
    await page.getByRole('dialog').getByRole('button', { name: 'מחק', exact: true }).click();
    expect((await deletion).ok()).toBe(true);
    await expect(rangeCard).toHaveCount(0);
    card = await discover(page, corpus);
    await expect(card.getByRole('button', { name: 'שמור טווח', exact: true })).toBeEnabled();
    await expect(card.getByRole('button', { name: 'שמור התאמה', exact: true })).toBeEnabled();
    await page.reload();
    card = await discover(page, corpus);
    await expect(card.getByRole('button', { name: 'שמור טווח', exact: true })).toBeEnabled();
    await expect(card.getByRole('button', { name: 'שמור התאמה', exact: true })).toBeEnabled();
    await clean(page);
  });
}

test('Tefillot reader selection saves a canonical range that opens from the library', async ({ page }) => {
  await login(page);
  await clean(page);
  const card = await discover(page, 'tefillot');
  await card.getByRole('button', { name: 'פתח בקורא', exact: true }).click();
  await expect(page.locator('.prayer-text mark')).toBeVisible();
  // Finish the reader's automatic smooth scroll before making a native selection.
  await page.locator('.prayer-text mark').evaluate(element =>
    element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await expect(page.locator('.prayer-text mark')).toBeInViewport();
  await page.waitForTimeout(250);
  const selected = await page.locator('.prayer-text mark').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return element.textContent;
  });
  await page.getByRole('button', { name: 'חשב גימטריה', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'גימטריית הבחירה' });
  await expect(dialog).toBeVisible();
  const saving = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/entries');
  await dialog.getByRole('button', { name: 'שמור', exact: true }).click();
  const response = await saving;
  expect(response.ok()).toBe(true);
  const id = (await response.json()).id;
  expect(response.request().postDataJSON().tefillotContext.unitId).toBeGreaterThan(0);
  await expect(dialog.getByRole('button', { name: 'נשמר', exact: true })).toBeDisabled();
  await page.locator('.app-header').getByRole('button', { name: 'שמורים', exact: true }).click();
  await page.locator(`[data-entry-id="${id}"]`).getByRole('button', { name: 'פתח פירוט', exact: true }).click();
  await page.locator(`[data-detail-entry-id="${id}"]`).getByRole('button', { name: 'פתח בתפילה', exact: true }).click();
  await expect(page.locator('.prayer-text mark')).toHaveText(selected);
  await clean(page);
});

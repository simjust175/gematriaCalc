import { test, expect } from '@playwright/test';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function loginAndOpenTanach(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.getByRole('button', { name: 'תנ״ך' }).click();
  await expect(page.locator('.verse-list')).toBeVisible();
}

async function chooseBook(page, name) {
  await page.getByRole('combobox', { name: 'ספר', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

async function chooseParsha(page, name) {
  await page.getByRole('combobox', { name: 'פרשה', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

test('Torah parashah reader loads complete canonical ranges without changing Nach navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAndOpenTanach(page);

  await chooseBook(page, 'במדבר');
  await chooseParsha(page, 'נשא');

  const verseRows = page.locator('.verse-list button');
  await expect(page.locator('.verse-toolbar h2')).toHaveText('במדבר ד:כא');
  await expect(verseRows.first()).toHaveAttribute('aria-label', 'פסוק כא בפרק ד');
  await expect(verseRows.last()).toHaveAttribute('aria-label', 'פסוק פט בפרק ז');
  await expect(page.locator('.verse-chapter-divider')).toHaveText(['פרק ד', 'פרק ה', 'פרק ו', 'פרק ז']);

  const expectedNasoRows = [];
  for (const chapter of [4, 5, 6, 7]) {
    const response = await page.context().request.get(
      new URL(`/api/tanach/verses?book=Numbers&chapter=${chapter}`, page.url()).href
    );
    expect(response.ok()).toBe(true);
    const { verses } = await response.json();
    expectedNasoRows.push(...verses.filter(item => (
      (chapter > 4 || item.verse >= 21) && (chapter < 7 || item.verse <= 89)
    )));
  }
  await expect(verseRows).toHaveCount(expectedNasoRows.length);

  await page.getByRole('button', { name: 'פסוק א בפרק ז', exact: true }).click();
  await expect(page.locator('.verse-toolbar h2')).toHaveText('במדבר ז:א');
  await page.getByTitle('הפסוק הקודם').click();
  await expect(page.locator('.verse-toolbar h2')).toHaveText('במדבר ו:כז');
  await page.getByTitle('הפסוק הבא').click();
  await expect(page.locator('.verse-toolbar h2')).toHaveText('במדבר ז:א');

  await page.getByRole('button', { name: 'פסוק פט בפרק ז', exact: true }).click();
  await page.getByTitle('הפסוק הבא').click();
  await expect(page.locator('.verse-toolbar h2')).toHaveText('במדבר ז:פט');

  await chooseParsha(page, 'במדבר');
  await expect(page.locator('.verse-toolbar h2')).toHaveText('במדבר א:א');
  await expect(verseRows.first()).toHaveAttribute('aria-label', 'פסוק א בפרק א');
  await expect(verseRows.last()).toHaveAttribute('aria-label', 'פסוק כ בפרק ד');
  await expect(page.getByRole('button', { name: 'פסוק פט בפרק ז', exact: true })).toHaveCount(0);

  await chooseBook(page, 'דברים');
  await chooseParsha(page, 'וילך');
  await expect(page.locator('.verse-toolbar h2')).toHaveText('דברים לא:א');
  await expect(verseRows.first()).toHaveAttribute('aria-label', 'פסוק א בפרק לא');
  await expect(verseRows.last()).toHaveAttribute('aria-label', 'פסוק ל בפרק לא');
  await expect(page.locator('.verse-chapter-divider')).toHaveCount(1);

  await chooseBook(page, 'יהושע');
  await expect(page.getByRole('combobox', { name: 'פרק', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'פרק', exact: true }).click();
  await page.getByRole('option', { name: 'ב', exact: true }).click();
  await page.getByRole('combobox', { name: 'פסוק', exact: true }).click();
  await page.getByRole('option', { name: 'ג', exact: true }).click();
  await expect(page.locator('.verse-toolbar h2')).toHaveText('יהושע ב:ג');
});
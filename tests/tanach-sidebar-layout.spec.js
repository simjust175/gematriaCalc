import { test, expect } from '@playwright/test';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function loginAndOpenTanach(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.getByRole('button', { name: 'תנ״ך' }).click();
  await expect(page.locator('.navigator-card')).toBeVisible();
  await expect(page.locator('.verse-list')).toBeVisible();
}

async function sidebarMetrics(page) {
  return page.locator('.navigator-card').evaluate((card) => {
    const verseList = card.querySelector('.verse-list');
    const cardBox = card.getBoundingClientRect();
    const listBox = verseList.getBoundingClientRect();
    const listStyle = getComputedStyle(verseList);
    return {
      cardHeight: cardBox.height,
      cardBottom: cardBox.bottom,
      listHeight: listBox.height,
      listScrollHeight: verseList.scrollHeight,
      listOverflowY: listStyle.overflowY,
      listFlexGrow: listStyle.flexGrow,
      listMinHeight: listStyle.minHeight,
      listMaxHeight: listStyle.maxHeight,
    };
  });
}

test('Tanach sidebar verse list flexes and scrolls in Torah and Nach modes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAndOpenTanach(page);

  const torahMetrics = await sidebarMetrics(page);
  expect(torahMetrics.listOverflowY).toBe('auto');
  expect(torahMetrics.listFlexGrow).toBe('1');
  expect(torahMetrics.listMinHeight).toBe('0px');
  expect(torahMetrics.listMaxHeight).toBe('none');
  expect(torahMetrics.listHeight).toBeGreaterThan(500);
  expect(torahMetrics.listScrollHeight).toBeGreaterThan(torahMetrics.listHeight);

  await page.setViewportSize({ width: 1440, height: 650 });
  await expect.poll(async () => (await sidebarMetrics(page)).listHeight).toBeLessThan(torahMetrics.listHeight - 250);

  const bookSelect = page.getByRole('combobox', { name: 'ספר' });
  await bookSelect.click();
  await page.getByRole('option', { name: 'יהושע', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'פרק' })).toBeVisible();

  const nachMetrics = await sidebarMetrics(page);
  expect(nachMetrics.listOverflowY).toBe('auto');
  expect(nachMetrics.listFlexGrow).toBe('1');
  expect(nachMetrics.listMinHeight).toBe('0px');
  expect(nachMetrics.listMaxHeight).toBe('none');
  expect(nachMetrics.listHeight).toBeGreaterThan(250);
  expect(nachMetrics.listScrollHeight).toBeGreaterThan(nachMetrics.listHeight);
  expect(nachMetrics.cardBottom).toBeLessThanOrEqual(650);
});
import { test, expect } from '@playwright/test';
import { APP_RELEASE } from '../src/config/appRelease.js';
import { UPDATE_KEYS, UPDATE_QUERY } from '../src/updates/release.js';

test.use({ serviceWorkers: 'block' });

async function openUpdate(page, { critical = false, notes = [] } = {}) {
  await page.addInitScript(keys => {
    if (!localStorage.getItem(keys.acknowledged)) localStorage.setItem(keys.acknowledged, '0.9.0');
    localStorage.setItem('update-test-user-preference', 'keep');
  }, UPDATE_KEYS);
  await page.route('**/api/auth/check', route => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/tefillot/availability', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/tefillot/catalog', route => route.fulfill({
    json: { stats: { unit_count: 3 }, occasions: [{
      slug: 'weekday', label: 'חול', services: [{
        slug: 'shacharit', label: 'שחרית', sections: [{ key: 'shema', label: 'ק״ש וברכותיה', count: 3 }],
      }],
    }] },
  }));
  await page.route('**/api/tefillot/section?*', route => route.fulfill({
    json: { section: Array.from({ length: 3 }, (_, index) => ({
      id: index + 1, sequence: index + 1, hebrew_text: 'שמע ישראל ה׳ אלהינו ה׳ אחד',
      source_work: 'Browser layout fixture', source_version: 'Test',
      license: 'Public Domain', version_source: 'Test', source_reference: 'Test',
    })) },
  }));
  const deployed = { version: '0.9.0', notes, critical };
  await page.route('**/app-release.json?*', route => route.fulfill({ json: deployed }));
  await page.goto('/');
  await page.locator('.app-header').getByRole('button', { name: 'תפילות', exact: true }).click();
  await expect(page.locator('.prayer-text p')).toHaveCount(3);
  deployed.version = APP_RELEASE.version;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog', { name: 'עדכון חדש זמין' })).toBeVisible();
  return deployed;
}

test('minimal update is compact, centered, RTL and keyboard accessible', async ({ page }, testInfo) => {
  await openUpdate(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'עדכן עכשיו' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'מאוחר יותר' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'מה חדש' })).toHaveCount(0);
  const rect = await dialog.boundingBox();
  expect(rect.width).toBeLessThanOrEqual(420);
  expect(Math.abs(rect.x + rect.width / 2 - page.viewportSize().width / 2)).toBeLessThan(2);
  await expect.poll(async () => {
    const settled = await dialog.boundingBox();
    return Math.abs(settled.y + settled.height / 2 - page.viewportSize().height / 2);
  }).toBeLessThan(2);
  expect(await dialog.evaluate(el => getComputedStyle(el).direction)).toBe('rtl');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'מאוחר יותר' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'סגירה' })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('update-minimal.png'), animations: 'disabled' });
});

test('optional Hebrew notes show the restrained מה חדש section', async ({ page }, testInfo) => {
  await openUpdate(page, { notes: ['שיפור הקריאה בתפילות', 'עדכוני נוחות קטנים'] });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'מה חדש' })).toBeVisible();
  await expect(dialog.locator('.release-notes li')).toHaveCount(2);
  await expect(dialog).toContainText('שיפור הקריאה בתפילות');
  await page.screenshot({ path: testInfo.outputPath('update-notes.png'), animations: 'disabled' });
});

test('tablet update card stays centered and inside the viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 768, height: 1024 });
  await openUpdate(page, { notes: ['שיפור הקריאה בתפילות'] });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'עדכן עכשיו' })).toBeFocused();
  await expect.poll(async () => {
    const bounds = await dialog.boundingBox();
    return Math.abs(bounds.y + bounds.height / 2 - 512);
  }).toBeLessThan(2);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThan(0);
  expect(bounds.x + bounds.width).toBeLessThan(768);
  expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.y + bounds.height).toBeLessThan(1024);
  await page.screenshot({ path: testInfo.outputPath('update-tablet.png'), animations: 'disabled' });
});

test('later defers only this session and preserves acknowledgement and unrelated preferences', async ({ page }) => {
  await openUpdate(page);
  await page.getByRole('dialog').getByRole('button', { name: 'מאוחר יותר' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(keys => ({
    ack: localStorage.getItem(keys.acknowledged),
    deferred: sessionStorage.getItem(keys.deferred),
    preference: localStorage.getItem('update-test-user-preference'),
    overflow: document.body.style.overflow,
  }), UPDATE_KEYS)).toEqual({
    ack: '0.9.0', deferred: APP_RELEASE.version, preference: 'keep', overflow: '',
  });
  await page.reload();
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A new visit has a new tab session, but retains the unacknowledged local version.
  const laterVisit = await page.context().newPage();
  await openUpdate(laterVisit);
  await laterVisit.close();
});

test('close X and Escape defer without acknowledging; a newer release can still prompt', async ({ page }) => {
  const deployed = await openUpdate(page);
  await page.getByRole('button', { name: 'סגירה', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  deployed.version = '1.0.1';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), UPDATE_KEYS.acknowledged)).toBe('0.9.0');
});

test('critical update has no dismissal controls and cannot escape its focus trap', async ({ page }, testInfo) => {
  await openUpdate(page, { critical: true });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'מאוחר יותר' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'סגירה' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'עדכן עכשיו' })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('update-critical.png'), animations: 'disabled' });
});

test('acknowledgement in another tab closes the same browser release prompt', async ({ page }) => {
  await openUpdate(page);
  const otherTab = await page.context().newPage();
  await otherTab.goto('/');
  await otherTab.evaluate(({ key, version }) => localStorage.setItem(key, version), {
    key: UPDATE_KEYS.acknowledged, version: APP_RELEASE.version,
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await otherTab.close();
});

test('updating state refreshes assets, acknowledges only after reload, and preserves browser data', async ({ page }, testInfo) => {
  await openUpdate(page);
  const origin = new URL(page.url()).origin;
  await page.context().addCookies([{ name: 'update-session-proof', value: 'keep', url: origin, httpOnly: true }]);
  let finishPreflight;
  const gate = new Promise(resolve => { finishPreflight = resolve; });
  await page.route(`**/*${UPDATE_QUERY}=*`, async route => {
    if (route.request().isNavigationRequest()) return route.continue();
    await gate;
    await route.fulfill({
      contentType: 'text/html',
      body: `<html><head><meta name="gematria-release" content="${APP_RELEASE.version}"></head></html>`,
    });
  });
  await page.getByRole('dialog').getByRole('button', { name: 'עדכן עכשיו' }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'מעדכנים את המערכת...' })).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), UPDATE_KEYS.acknowledged)).toBe('0.9.0');
  await page.screenshot({ path: testInfo.outputPath('update-progress.png'), animations: 'disabled' });
  const navigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
  finishPreflight();
  await navigation;
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(keys => ({
    ack: localStorage.getItem(keys.acknowledged),
    pending: sessionStorage.getItem(keys.pending),
    preference: localStorage.getItem('update-test-user-preference'),
  }), UPDATE_KEYS)).toEqual({ ack: APP_RELEASE.version, pending: null, preference: 'keep' });
  expect(new URL(page.url()).searchParams.has(UPDATE_QUERY)).toBe(false);
  expect((await page.context().cookies()).find(cookie => cookie.name === 'update-session-proof')?.value).toBe('keep');
});

test('stale server HTML shows a retry error rather than falsely acknowledging an update', async ({ page }) => {
  await openUpdate(page, { critical: true });
  await page.route(`**/*${UPDATE_QUERY}=*`, route => route.fulfill({
    contentType: 'text/html', body: '<meta name="gematria-release" content="0.9.0">',
  }));
  await page.getByRole('button', { name: 'עדכן עכשיו' }).click();
  await expect(page.getByRole('alert')).toContainText('העדכון עדיין נטען בשרת');
  await expect(page.getByRole('button', { name: 'עדכן עכשיו' })).toBeEnabled();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), UPDATE_KEYS.acknowledged)).toBe('0.9.0');
});

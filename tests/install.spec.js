import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.app-header')).toBeVisible();
}

test('desktop install action appears only when prompting is available and is not repeated after acceptance', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);

  await page.evaluate(() => {
    window.__installPrompted = false;
    const event = new Event('beforeinstallprompt');
    Object.defineProperties(event, {
      prompt: {
        value: async () => { window.__installPrompted = true; },
      },
      userChoice: {
        value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
    });
    window.dispatchEvent(event);
  });

  await page.getByRole('button', { name: 'אפשרויות נוספות' }).click();
  const install = page.getByRole('button', { name: /התקן במחשב/ });
  await expect(install).toBeVisible();
  await expect(install).toContainText('פתיחה כאפליקציה עצמאית');
  await install.click();
  await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));

  await page.getByRole('button', { name: 'אפשרויות נוספות' }).click();
  await expect(page.getByRole('button', { name: /התקן במחשב/ })).toHaveCount(0);
  await expect(page.getByText('האפליקציה מותקנת במחשב')).toBeVisible();
});

test('unsupported browsers offer an honest Windows shortcut download', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'אפשרויות נוספות' }).click();
  await expect(page.getByRole('button', { name: /התקן במחשב/ })).toHaveCount(0);
  const shortcut = page.getByRole('button', { name: /הורד קיצור דרך/ });
  await expect(shortcut).toBeVisible();
  await expect(shortcut).toContainText('יישמר בהורדות');

  const downloadPromise = page.waitForEvent('download');
  await shortcut.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('גימטריה.url');
  const content = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  expect(content).toContain('[InternetShortcut]');
  expect(content).toContain(`URL=${new URL('/', page.url()).href}`);
});

test('a fresh browser prompt recovers from stale installed storage and dismissal can be retried', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => localStorage.setItem('gematria-pwa-installed', 'true'));
  await login(page);

  const dispatchPrompt = outcome => page.evaluate(selectedOutcome => {
    const event = new Event('beforeinstallprompt');
    Object.defineProperties(event, {
      prompt: { value: async () => {} },
      userChoice: { value: Promise.resolve({ outcome: selectedOutcome, platform: 'web' }) },
    });
    window.dispatchEvent(event);
  }, outcome);

  await dispatchPrompt('dismissed');
  await page.getByRole('button', { name: 'אפשרויות נוספות' }).click();
  await expect(page.getByRole('button', { name: /התקן במחשב/ })).toBeVisible();
  await page.getByRole('button', { name: /התקן במחשב/ }).click();

  await dispatchPrompt('accepted');
  await page.getByRole('button', { name: 'אפשרויות נוספות' }).click();
  await expect(page.getByRole('button', { name: /התקן במחשב/ })).toBeVisible();
});

test('secondary menu is keyboard-safe and remains within a mobile viewport', async ({ page }) => {
  await login(page);
  const trigger = page.getByRole('button', { name: 'אפשרויות נוספות' });
  await trigger.click();
  const panel = page.locator('.more-menu-panel');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('manifest and network-only service worker expose install metadata', async ({ page }) => {
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.name).toBe('גימטריה');
  expect(manifest.short_name).toBe('גימטריה');
  expect(manifest.lang).toBe('he');
  expect(manifest.dir).toBe('rtl');
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  const serviceWorkerResponse = await page.request.get('/sw.js');
  expect(serviceWorkerResponse.ok()).toBe(true);
  expect(await serviceWorkerResponse.text()).not.toContain('caches.');

  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(icon.src);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }

  await login(page);
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return {
      scope: ready.scope,
      caches: await caches.keys(),
    };
  });
  expect(registration.scope).toBe(new URL('/', page.url()).href);
  expect(registration.caches).toEqual([]);

  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const authResponse = await page.request.get('/api/auth/check');
  expect(authResponse.ok()).toBe(true);
  expect((await authResponse.json()).authenticated).toBe(true);
});

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';
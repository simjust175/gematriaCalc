import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 900, height: 1000 },
  { width: 768, height: 1024 },
]) {
  test(`Tefillot title stays within the reader at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize(viewport);
    // Browser-only fixtures: no login or corpus writes are needed for this layout check.
    await page.route('**/api/auth/check', route => route.fulfill({ json: { authenticated: true } }));
    await page.route('**/api/tefillot/availability', route => route.fulfill({ json: { enabled: true } }));
    await page.route('**/api/tefillot/catalog', route => route.fulfill({
      json: {
        occasions: [{
          slug: 'weekday', label: 'חול', services: [{
            slug: 'shacharit', label: 'שחרית', sections: [{
              key: 'shema', label: 'ק״ש וברכותיה', unit_count: 60,
            }],
          }],
        }],
        stats: { unit_count: 60 },
      },
    }));
    await page.route('**/api/tefillot/section?*', route => route.fulfill({
      json: {
        section: Array.from({ length: 60 }, (_, index) => ({
          id: index + 1, sequence: index + 1,
          hebrew_text: 'שמע ישראל ה׳ אלהינו ה׳ אחד',
          source_work: 'Layout fixture', source_version: 'Test',
          license: 'Public Domain', source_reference: 'Test',
        })),
      },
    }));
    await page.goto('/');
    await page.locator('.app-header').getByRole('button', { name: 'תפילות', exact: true }).click();
    await expect(page.locator('.prayer-text p')).toHaveCount(60);

    const title = page.locator('.reader-title-sticky');
    const geometry = () => page.evaluate(() => {
      const rect = selector => {
        const { top, bottom, left, right, height } = document.querySelector(selector).getBoundingClientRect();
        return { top, bottom, left, right, height };
      };
      return {
        header: rect('.app-header'), heading: rect('.reader-heading'),
        title: rect('.reader-title-sticky'), card: rect('.reader-card'),
        article: rect('.prayer-text'),
      };
    });
    const initial = await geometry();
    await expect(title).toBeHidden();
    expect(Math.abs(initial.article.top - initial.heading.bottom)).toBeLessThan(1);
    expect(await title.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');

    await page.evaluate(() => {
      const heading = document.querySelector('.reader-heading').getBoundingClientRect();
      window.scrollTo(0, window.scrollY + heading.bottom + 100);
    });
    await expect(title).toBeVisible();
    await expect(title).toHaveText('ק״ש וברכותיה');
    const pinned = await geometry();
    expect(pinned.title.top).toBeGreaterThanOrEqual(pinned.header.bottom);
    expect(pinned.title.top - pinned.header.bottom).toBeLessThan(2);
    expect(pinned.title.left).toBeGreaterThanOrEqual(pinned.card.left);
    expect(pinned.title.right).toBeLessThanOrEqual(pinned.card.right);
    expect(pinned.title.height).toBeLessThanOrEqual(54);
    expect(await title.evaluate(el => getComputedStyle(el).direction)).toBe('rtl');
    expect(await title.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 253, 249)');
    expect(await title.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
    await expect(title.locator('button, svg, .mdi')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('reader-pinned.png') });

    // It must release at the card boundary rather than cover the source panel.
    await page.evaluate(() => {
      // Allow the card to reach the viewport top despite the short source footer.
      const spacer = document.createElement('div');
      spacer.style.height = `${window.innerHeight}px`;
      document.body.append(spacer);
      const card = document.querySelector('.reader-card').getBoundingClientRect();
      window.scrollTo(0, window.scrollY + card.bottom - 80);
    });
    await expect(title).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(title).toBeHidden();
    expect(await title.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
    const restored = await geometry();
    expect(restored.heading.height).toBe(initial.heading.height);
    expect(Math.abs(restored.article.top - restored.heading.bottom)).toBeLessThan(1);
  });
}

import { test, expect } from '@playwright/test';

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

function uniqueHebrewToken() {
  const alphabet = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  let seed = Date.now() + Math.floor(Math.random() * 100_000);
  let token = '';
  while (seed > 0) {
    token += alphabet[seed % alphabet.length];
    seed = Math.floor(seed / alphabet.length);
  }
  return token;
}

async function signIn(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.getByRole('button', { name: 'שמורים', exact: true })).toBeVisible();
}

test('saved library composes search, views, sorting, grouping, detail, and delete safety', async ({ page }, testInfo) => {
  await signIn(page);
  const token = uniqueHebrewToken();
  const texts = [`${token} אב`, `${token} ג`, `${token} ד`];
  const savedIds = [];

  try {
    for (const originalText of texts) {
      const response = await page.request.post(new URL('/api/entries', page.url()).href, {
        data: { originalText },
      });
      expect(response.status()).toBe(200);
      savedIds.push((await response.json()).id);
    }

    await page.getByRole('button', { name: 'שמורים', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'שמורים' })).toBeVisible();
    await expect(page.getByText('הספרייה האישית שלך')).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'חיפוש בספרייה' });
    const searchResponse = page.waitForResponse(response =>
      response.url().includes('/api/entries?')
        && response.url().includes(`search=${encodeURIComponent(token)}`)
    );
    await search.fill(token);
    expect((await searchResponse).ok()).toBe(true);

    const cards = page.locator('.entry-card');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('.entry-text mark')).toHaveCount(3);
    await expect(page.locator('.library-summary')).toContainText('3 שמורים');
    await expect(page.locator('.library-summary')).toContainText('2 ערכים שונים');
    await expect(page.locator('.library-summary')).toContainText('1 ערכים משותפים');

    const entriesList = page.locator('.entries-list');
    const boxes = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    if (testInfo.project.name === 'mobile-chromium') {
      expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThan(2);
    } else {
      expect(Math.abs(boxes[0].x - boxes[1].x)).toBeGreaterThan(100);
    }

    await page.getByTitle('תצוגת רשימה').click();
    await expect(entriesList).toHaveClass(/list-mode/);
    await page.getByRole('combobox', { name: 'מיון הספרייה' }).selectOption('gematria');
    await expect(cards).toHaveCount(3);

    await page.locator('.group-toggle').click();
    await expect(page.getByLabel('קבץ לפי גימטריה')).toBeChecked();
    await expect(entriesList).toHaveClass(/grouped-mode/);
    await expect(page.locator('.entry-group')).toHaveCount(2);
    await expect(page.locator('.shared-group .entry-card')).toHaveCount(2);
    await expect(cards).toHaveCount(3);

    const firstCard = cards.first();
    await firstCard.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
    await expect(firstCard.locator('.entry-detail')).toBeVisible();
    await expect(firstCard.locator('.detail-words')).toBeVisible();

    await firstCard.getByRole('button', { name: /פעולות עבור/ }).click();
    await firstCard.getByRole('menuitem', { name: 'העתק' }).click();
    await expect(page.getByRole('status')).toHaveText('הטקסט הועתק');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      document.execCommand = () => false;
    });
    await firstCard.getByRole('button', { name: /פעולות עבור/ }).click();
    await firstCard.getByRole('menuitem', { name: 'העתק' }).click();
    await expect(page.getByRole('status')).toHaveText('לא ניתן להעתיק כרגע');

    await firstCard.getByRole('button', { name: /פעולות עבור/ }).click();
    await firstCard.getByRole('menuitem', { name: 'מחק' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'ביטול' })).toBeFocused();
    await expect(page.getByRole('dialog')).toContainText(texts[0].split(' ')[0]);
    await page.getByRole('button', { name: 'ביטול' }).click();
    await expect(firstCard).toBeVisible();

    const deleteId = savedIds.pop();
    const deleteCard = page.locator(`[data-entry-id="${deleteId}"]`);
    await deleteCard.getByRole('button', { name: /פעולות עבור/ }).click();
    await deleteCard.getByRole('menuitem', { name: 'מחק' }).click();
    const deleteResponse = page.waitForResponse(response =>
      response.url().endsWith(`/api/entries/${deleteId}`)
        && response.request().method() === 'DELETE'
    );
    await page.getByRole('dialog').getByRole('button', { name: 'מחק' }).click();
    expect((await deleteResponse).ok()).toBe(true);
    await expect(deleteCard).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'שמורים' })).toBeFocused();
  } finally {
    for (const id of savedIds) {
      const response = await page.request.delete(new URL(`/api/entries/${id}`, page.url()).href);
      expect([200, 404]).toContain(response.status());
    }
  }
});

test('saved library loads later pages before grouping cross-page values', async ({ page }) => {
  await signIn(page);
  const fakeEntries = Array.from({ length: 101 }, (_, index) => ({
    id: 50000 + index,
    original_text: `ערך בדיקה ${index + 1}`,
    normalized_text: `ערך בדיקה ${index + 1}`,
    full_gematria: index === 100 ? 700 : 700 + index,
    full_gematria_hebrew: 'תש',
    initials: 'עב',
    initials_gematria: 72,
    initials_gematria_hebrew: 'עב',
    created_at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    words: [],
  }));

  await page.route('**/api/entries?**', async route => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 100);
    const grouped = url.searchParams.get('grouped') === 'true';
    let pageEntries;
    let pageCount;
    let paginationTotal;
    if (grouped) {
      const values = [...new Set(fakeEntries.map(entry => entry.full_gematria))];
      const pageValues = values.slice(offset, offset + limit);
      pageEntries = fakeEntries.filter(entry => pageValues.includes(entry.full_gematria));
      pageCount = pageValues.length;
      paginationTotal = values.length;
    } else {
      pageEntries = fakeEntries.slice(offset, offset + limit);
      pageCount = pageEntries.length;
      paginationTotal = fakeEntries.length;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        entries: pageEntries,
        total: fakeEntries.length,
        stats: { saved: 101, distinctValues: 100, sharedValues: 1 },
        pagination: {
          unit: grouped ? 'groups' : 'entries',
          pageCount,
          nextOffset: offset + pageCount,
          hasMore: offset + pageCount < paginationTotal,
        },
      }),
    });
  });

  await page.getByRole('button', { name: 'שמורים', exact: true }).click();
  await expect(page.locator('.entry-card')).toHaveCount(100);
  await page.locator('.group-toggle').click();
  await expect(page.getByLabel('קבץ לפי גימטריה')).toBeChecked();
  await expect(page.locator('.entry-card')).toHaveCount(21);
  await expect(page.locator('.entry-group')).toHaveCount(20);
  await expect(page.locator('.shared-group .entry-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'מחשבון', exact: true }).click();
  await page.getByRole('button', { name: 'שמורים', exact: true }).click();
  await expect(page.locator('.entry-card')).toHaveCount(100);
  await page.getByRole('button', { name: /הצג עוד/ }).click();
  await expect(page.locator('.entry-card')).toHaveCount(101);
});
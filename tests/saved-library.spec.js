import { test, expect } from '@playwright/test';
import { calculateMilui } from '../src/utils/milui.js';

test.use({ serviceWorkers: 'block' });

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
    await expect(page.locator('.entry-footer')).toHaveCount(3);
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
      const footerBoxes = await page.locator('.entry-footer').evaluateAll(nodes =>
        nodes.map(node => node.getBoundingClientRect())
      );
      expect(Math.abs(footerBoxes[0].y - footerBoxes[1].y)).toBeLessThan(2);
    }

    const initialFirstCard = cards.first();
    const initialFirstId = await initialFirstCard.getAttribute('data-entry-id');
    await initialFirstCard.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
    const initialDetail = page.locator(`[data-detail-entry-id="${initialFirstId}"]`);
    await expect(initialDetail).toBeVisible();
    const wordDisclosure = initialDetail.locator('details.detail-words');
    await expect(wordDisclosure).toHaveJSProperty('open', false);
    await expect(wordDisclosure.getByText('פירוט מילים')).toBeVisible();
    await expect(wordDisclosure.locator('.detail-word-block').first()).toBeHidden();
    await wordDisclosure.locator('summary').click();
    await expect(wordDisclosure).toHaveJSProperty('open', true);
    await expect(wordDisclosure.locator('.detail-word-block').first()).toBeVisible();
    await wordDisclosure.locator('summary').press('Enter');
    await expect(wordDisclosure).toHaveJSProperty('open', false);
    await expect(wordDisclosure.locator('.detail-word-block').first()).toBeHidden();
    const settingsResponse = await page.request.get(new URL('/api/settings/milui', page.url()).href);
    expect(settingsResponse.ok()).toBe(true);
    const settings = await settingsResponse.json();
    const selectedEntryText = await initialFirstCard.locator('.entry-text').innerText();
    const expectedMilui = calculateMilui(selectedEntryText, settings.mapping);
    await expect(initialDetail.getByText('מילוי נוכחי')).toBeVisible();
    await expect(initialDetail.locator('.detail-row--milui .detail-gematria')).toContainText(
      String(expectedMilui.fullGematria)
    );
    await expect(initialFirstCard).toHaveClass(/expanded/);
    await expect(initialFirstCard.locator('.entry-detail')).toHaveCount(0);
    const selectedBox = await initialFirstCard.boundingBox();
    const detailBox = await initialDetail.boundingBox();
    expect(detailBox.y).toBeGreaterThanOrEqual(selectedBox.y + selectedBox.height - 1);
    if (testInfo.project.name !== 'mobile-chromium') {
      const listBox = await entriesList.boundingBox();
      const rowCardBoxes = await cards.evaluateAll(nodes =>
        nodes.slice(0, 2).map(node => node.getBoundingClientRect())
      );
      expect(Math.abs(detailBox.x - listBox.x)).toBeLessThan(2);
      expect(Math.abs(detailBox.width - listBox.width)).toBeLessThan(2);
      expect(Math.abs(rowCardBoxes[0].height - rowCardBoxes[1].height)).toBeLessThan(2);
      expect(detailBox.y).toBeGreaterThanOrEqual(
        Math.max(...rowCardBoxes.map(box => box.y + box.height)) - 1
      );
    }
    await initialFirstCard.getByRole('button', { name: 'סגור', exact: true }).click();
    await expect(initialDetail).toHaveCount(0);

    await page.getByTitle('תצוגת רשימה').click();
    await expect(entriesList).toHaveClass(/list-mode/);
    await page.getByTitle('תצוגת כרטיסים').click();
    await expect(entriesList).not.toHaveClass(/list-mode/);
    await page.getByRole('combobox', { name: 'מיון הספרייה' }).selectOption('gematria');
    await expect(cards).toHaveCount(3);

    await page.locator('.group-toggle').click();
    await expect(page.getByLabel('קבץ לפי גימטריה')).toBeChecked();
    await expect(entriesList).toHaveClass(/grouped-mode/);
    await expect(page.locator('.entry-group')).toHaveCount(1);
    await expect(page.locator('.entries-list.grouped-mode > .entry-card')).toHaveCount(1);
    await expect(page.locator('.shared-group .entry-card')).toHaveCount(2);
    await expect(cards).toHaveCount(3);
    if (testInfo.project.name !== 'mobile-chromium') {
      const groupedListBox = await entriesList.boundingBox();
      const sharedGroupBox = await page.locator('.shared-group').boundingBox();
      const uniqueCardBox = await page.locator('.entries-list.grouped-mode > .entry-card').boundingBox();
      expect(Math.abs(sharedGroupBox.x - groupedListBox.x)).toBeLessThan(2);
      expect(Math.abs(sharedGroupBox.width - groupedListBox.width)).toBeLessThan(2);
      expect(Math.abs(sharedGroupBox.y - uniqueCardBox.y)).toBeGreaterThan(2);
    }

    const firstCard = cards.first();
    await firstCard.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
    const groupedDetail = page.locator('.shared-group .detail-panel');
    await expect(groupedDetail).toBeVisible();
    await expect(groupedDetail.locator('.detail-words')).toBeVisible();
    await expect(groupedDetail.locator('details.detail-words')).toHaveJSProperty('open', false);
    if (testInfo.project.name !== 'mobile-chromium') {
      const groupGridBox = await page.locator('.shared-group .group-entries').boundingBox();
      const groupedDetailBox = await groupedDetail.boundingBox();
      expect(Math.abs(groupedDetailBox.x - groupGridBox.x)).toBeLessThan(2);
      expect(Math.abs(groupedDetailBox.width - groupGridBox.width)).toBeLessThan(2);
    }

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
  await expect(page.locator('.entry-group')).toHaveCount(1);
  await expect(page.locator('.entries-list.grouped-mode > .entry-card')).toHaveCount(19);
  await expect(page.locator('.shared-group .entry-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'מחשבון', exact: true }).click();
  await page.getByRole('button', { name: 'שמורים', exact: true }).click();
  await expect(page.locator('.entry-card')).toHaveCount(100);
  await page.getByRole('button', { name: /הצג עוד/ }).click();
  await expect(page.locator('.entry-card')).toHaveCount(101);
});

test('saved library renders curated matches, opens reader, and removes only the connection', async ({ page }) => {
  const entry = {
    id: 804, original_text: 'שלום', full_gematria: 376, full_gematria_hebrew: 'שעו',
    initials: 'ש', initials_gematria: 300, initials_gematria_hebrew: 'ש',
    finals: 'ם', finals_gematria: 40, finals_gematria_hebrew: 'מ',
    created_at: new Date().toISOString(), words: [], curated_match_count: 1,
    curated_matches: [{
      id: 1301, originalText: 'בראשית', tanachContext: {
        bookSlug: 'genesis', chapter: 1, verse: 1, start: 0, end: 6,
      }, reasonCodes: ['full_gematria', 'initials_text'],
    }],
  };
  await page.addInitScript(({ mockedEntry }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/entries?')) {
        return Promise.resolve(new Response(JSON.stringify({
          entries: [mockedEntry], total: 1,
          stats: { saved: 1, distinctValues: 1, sharedValues: 0 },
          pagination: { hasMore: false, nextOffset: 1 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/api/entries/804/curated-matches/1301')
          && (init?.method || input.method) === 'DELETE') {
        window.__curatedDeleteCalled = true;
        return Promise.resolve(new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }));
      }
      return originalFetch(input, init);
    };
  }, { mockedEntry: entry });
  await signIn(page);
  await page.getByRole('button', { name: 'שמורים', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'שמורים' })).toBeVisible();
  const card = page.locator('[data-entry-id="804"]');
  await expect(card).toContainText('1 התאמות שמורות');
  await card.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
  const detail = page.locator('[data-detail-entry-id="804"]');
  await expect(detail.getByRole('heading', { name: 'התאמות נבחרות' })).toBeVisible();
  expect((await detail.boundingBox()).height).toBeLessThan(360);
  await expect(detail).toContainText('גימטריה');
  await expect(detail).toContainText('ראשי תיבות');
  await detail.getByRole('button', { name: 'סגור פירוט' }).click();
  await expect(detail).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'פתח פירוט', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await card.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
  const reopenedDetail = page.locator('[data-detail-entry-id="804"]');
  await expect(reopenedDetail).toBeVisible();
  await reopenedDetail.getByRole('button', { name: 'פתח בקורא' }).click();
  await expect(page.locator('.tanach-page')).toBeVisible();
  await page.getByRole('button', { name: 'שמורים', exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'פתח פירוט', exact: true }).click();
  const openDetail = page.locator('[data-detail-entry-id="804"]');
  await openDetail.getByRole('button', { name: 'הסר' }).click();
  await expect(openDetail).toContainText('להסיר?');
  await openDetail.getByRole('button', { name: 'ביטול' }).click();
  await expect(openDetail.getByRole('button', { name: 'הסר' })).toBeVisible();
  await openDetail.getByRole('button', { name: 'הסר' }).click();
  await openDetail.getByRole('button', { name: 'אישור' }).click();
  await expect(card).toBeVisible();
  await expect(card).not.toContainText('1 התאמות שמורות');
  await expect.poll(() => page.evaluate(() => window.__curatedDeleteCalled)).toBe(true);
});
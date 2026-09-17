import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const e2ePassword = process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password';

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill(e2ePassword);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}

test('calculator discovery filters and opens the exact canonical Tanach range', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  await page.locator('.heb-input').fill('בראשית');

  const discovery = page.locator('.gematria-discovery');
  await expect(discovery.getByRole('heading')).toContainText('913');
  await expect(discovery.locator('.discovery-header .method-selector')).toHaveCount(0);
  await expect(discovery.locator('.controls-secondary-row .method-selector')).toBeVisible();
  const methodBox = await discovery.locator('.method-selector').boundingBox();
  const filterBox = await discovery.locator('.filter-list').boundingBox();
  expect(methodBox.x).toBeLessThan(filterBox.x);
  await expect(discovery.getByRole('button', { name: /הכול/ })).toBeVisible();
  await expect(discovery.getByRole('button', { name: /חלקי? מילים|חלק ממילה/ })).toHaveCount(0);
  await expect(discovery.locator('.match-card:not(.skeleton-card)').first()).toBeVisible();
  const allTypeLabels = await discovery.locator('.type-label').allTextContents();
  expect(allTypeLabels.length).toBeGreaterThan(0);
  expect(allTypeLabels.every(label => ['מילה אחת', 'מילים שלימות'].includes(label.trim()))).toBe(true);
  await discovery.getByRole('button', { name: /מילה שלמה/ }).click();

  const genesis = discovery.locator('.match-card').filter({
    has: page.locator('.citation strong', { hasText: 'בראשית א:א' }),
  }).first();
  await expect(genesis).toBeVisible();
  await expect(genesis.locator('.type-label')).toHaveText('מילה אחת');
  await genesis.getByRole('button', { name: 'פתח בקורא' }).click();

  await expect(page.locator('.verse-toolbar h2')).toContainText('בראשית א:א');
  await expect(page.locator('.verse-token--letter.verse-token--range')).toHaveCount(6);
  await expect(page.locator('.primary-value strong')).toHaveText('913');
});

test('changing target clears stale cards immediately and load more appends server results', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  const textarea = page.locator('.heb-input');
  const discovery = page.locator('.gematria-discovery');

  await textarea.fill('בראשית');
  await expect(discovery.locator('.match-card:not(.skeleton-card)').first()).toBeVisible();
  await textarea.fill('שלום');
  await expect(discovery.getByRole('heading')).toContainText('376');
  await expect(discovery.locator('.match-card:not(.skeleton-card)')).toHaveCount(0);

  await textarea.fill('בראשית');
  await expect(discovery.locator('.load-more')).toBeVisible();
  await expect(discovery.locator('.match-card:not(.skeleton-card)')).toHaveCount(12);
  await discovery.locator('.load-more').click();
  await expect(discovery.locator('.match-card:not(.skeleton-card)')).toHaveCount(24);
});

test('Kollel keeps its label, effective target, active state, and corpus counts synchronized', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);

  let gematriaRequestCount = 0;
  await page.route('**/api/tanach/gematria-matches**', async route => {
    const value = new URL(route.request().url()).searchParams.get('value');
    if (value === '44' || value === '45') {
      gematriaRequestCount += 1;
      if (gematriaRequestCount > 1) await new Promise(resolve => setTimeout(resolve, 250));
    }
    await route.continue();
  });

  const discovery = page.locator('.gematria-discovery');
  const kollel = discovery.locator('.kollel-toggle');
  const filterCounts = discovery.locator('.filter-list button span');

  const rawResponsePromise = page.waitForResponse(response => (
    response.url().includes('/api/tanach/gematria-matches')
    && new URL(response.url()).searchParams.get('value') === '44'
  ));
  await page.locator('.heb-input').fill('44');
  const rawResponse = await rawResponsePromise;
  expect((await rawResponse.json()).target).toBe(44);
  await expect(discovery.getByRole('heading')).toContainText('44');
  await expect(kollel).toContainText('בלי הכולל');
  await expect(kollel).toHaveAttribute('aria-pressed', 'false');
  await expect(discovery.locator('.total-mark strong')).toHaveText('697');
  await expect(filterCounts).toHaveText(['697', '497', '200']);

  const plusOneResponsePromise = page.waitForResponse(response => (
    response.url().includes('/api/tanach/gematria-matches')
    && new URL(response.url()).searchParams.get('value') === '45'
  ));
  await kollel.click();
  await expect(kollel).toContainText('עם הכולל');
  await expect(kollel).toHaveAttribute('aria-pressed', 'true');
  await expect(kollel).toHaveAttribute('aria-busy', 'true');
  await expect(kollel.locator('.mdi-loading')).toBeVisible();
  const plusOneResponse = await plusOneResponsePromise;
  expect((await plusOneResponse.json()).target).toBe(45);
  await expect(discovery.getByRole('heading')).toContainText('45');
  await expect(discovery.locator('.total-mark strong')).toHaveText('1,722');
  await expect(filterCounts).toHaveText(['1722', '1456', '266']);
  await expect(kollel).toHaveAttribute('aria-busy', 'false');

  const restoredResponsePromise = page.waitForResponse(response => (
    response.url().includes('/api/tanach/gematria-matches')
    && new URL(response.url()).searchParams.get('value') === '44'
  ));
  await kollel.click();
  await expect(kollel).toContainText('בלי הכולל');
  await expect(kollel).toHaveAttribute('aria-pressed', 'false');
  const restoredResponse = await restoredResponsePromise;
  expect((await restoredResponse.json()).target).toBe(44);
  await expect(discovery.getByRole('heading')).toContainText('44');
  await expect(discovery.locator('.total-mark strong')).toHaveText('697');
  await expect(filterCounts).toHaveText(['697', '497', '200']);
});

test('calculator discovery switches intentionally between gematria and letter sequences', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  await page.locator('.heb-input').fill('שב״מ');

  const discovery = page.locator('.gematria-discovery');
  const initials = discovery.getByRole('button', { name: 'ראשי תיבות' });
  const finals = discovery.getByRole('button', { name: 'סופי תיבות' });
  const methodSelector = discovery.locator('.controls-secondary-row .method-selector');
  await expect(initials).toBeEnabled();
  await expect(finals).toBeEnabled();
  const gematriaSelectorX = (await methodSelector.boundingBox()).x;

  await initials.click();
  await expect(initials).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.abs((await methodSelector.boundingBox()).x - gematriaSelectorX)).toBeLessThan(0.5);
  const orderSwitch = discovery.getByRole('switch', { name: /אותן אותיות בכל סדר/ });
  await expect(orderSwitch).toBeVisible();
  await expect(orderSwitch).toHaveAttribute('aria-checked', 'false');
  const unorderedInitials = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/tanach/gematria-matches'
      && url.searchParams.get('method') === 'initials'
      && url.searchParams.get('order_independent') === 'true';
  });
  await orderSwitch.click();
  await unorderedInitials;
  await expect(orderSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(discovery.getByRole('heading')).toContainText('שבמ');
  await expect(discovery.getByText('מילים רצופות הפותחות באותיות שבמ')).toBeVisible();
  await expect(discovery.getByRole('button', { name: /מילה שלמה/ })).toHaveCount(0);
  await expect(discovery.locator('.controls-secondary-row .method-selector')).toBeVisible();

  await finals.click();
  await expect(finals).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.abs((await methodSelector.boundingBox()).x - gematriaSelectorX)).toBeLessThan(0.5);
  await expect(orderSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(discovery.getByRole('heading')).toContainText('שבמ');
  await expect(discovery.getByText('מילים רצופות המסתיימות באותיות שבמ')).toBeVisible();

  await page.locator('.heb-input').fill('ב');
  await expect(initials).toBeEnabled();
  await initials.click();
  await expect(discovery.getByRole('heading')).toContainText('ראשי התיבות ב');
});

test('Tanach edge cards highlight only matching initial and final letters', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  const textarea = page.locator('.heb-input');
  const discovery = page.locator('.gematria-discovery');

  await textarea.fill('בב');
  await discovery.getByRole('button', { name: 'ראשי תיבות' }).click();
  const initialsCard = discovery.locator('.match-card').filter({ hasText: 'בראשית א:א' }).first();
  await expect(initialsCard).toBeVisible();
  await expect(initialsCard.locator('.context-text mark')).toHaveText([/^ב/u, /^ב/u]);
  const initialsText = await initialsCard.locator('.context-text').textContent();
  expect(initialsText.normalize('NFD').replace(/[\u0591-\u05C7]/gu, '')).toContain('בראשית ברא');

  await textarea.fill('תא');
  await discovery.getByRole('button', { name: 'סופי תיבות' }).click();
  const finalsCard = discovery.locator('.match-card').filter({ hasText: 'בראשית א:א' }).first();
  await expect(finalsCard).toBeVisible();
  await expect(finalsCard.locator('.context-text mark')).toHaveText([/^ת/u, /^א/u]);
  const finalsText = await finalsCard.locator('.context-text').textContent();
  expect(finalsText.normalize('NFD').replace(/[\u0591-\u05C7]/gu, '')).toContain('בראשית ברא');
});

test('calculator discovery navigates Tanach scopes with accessible listboxes while preserving the weekly shortcut', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  await page.locator('.heb-input').fill('יהוה');

  const discovery = page.locator('.gematria-discovery');
  const book = discovery.getByRole('combobox', { name: 'ספר', exact: true });
  await expect(book).toBeEnabled();
  await book.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await book.press('End');
  await book.press('Escape');
  await expect(book).toHaveAttribute('aria-expanded', 'false');

  await book.click();
  await page.getByRole('option', { name: 'בראשית', exact: true }).click();
  const parshah = discovery.getByRole('combobox', { name: 'פרשה', exact: true });
  await expect(parshah).toBeVisible();
  await parshah.click();
  await expect(page.getByRole('option', { name: 'ויצא', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'יתרו', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'ויצא', exact: true }).click();
  await expect(discovery.locator('.match-card:not(.skeleton-card)').first()).toBeVisible();
  await expect(discovery.locator('.citation strong').first()).toContainText('בראשית');

  const weekly = discovery.getByRole('button', { name: /פרשת השבוע/ });
  await weekly.click();
  await expect(weekly).toHaveAttribute('aria-pressed', 'true');
  await expect(book).toContainText('כל התנ״ך');
  await expect(parshah).toHaveCount(0);
  await book.click();
  await page.getByRole('option', { name: 'ישעיהו', exact: true }).click();
  await expect(weekly).toHaveAttribute('aria-pressed', 'false');
  const chapter = discovery.getByRole('combobox', { name: 'פרק', exact: true });
  await expect(chapter).toBeVisible();
  await chapter.click();
  await page.getByRole('option', { name: 'פרק מ', exact: true }).click();
  const verse = discovery.getByRole('combobox', { name: 'פסוק', exact: true });
  await expect(verse).toBeVisible();
  await verse.click();
  await page.getByRole('option', { name: 'פסוק ג', exact: true }).click();
  await expect(discovery.locator('.citation strong').first()).toContainText('ישעיהו מ:ג');
});

test('Tanach listbox selectors do not overflow on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.locator('.heb-input').fill('יהוה');
  const discovery = page.locator('.gematria-discovery');
  await expect(discovery.getByRole('combobox', { name: 'ספר', exact: true })).toBeEnabled();
  await expect(discovery.locator('.discovery-header .method-selector')).toHaveCount(0);
  await expect(discovery.locator('.controls-secondary-row .method-selector')).toBeVisible();
  expect(await discovery.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('curated single save confirms a new parent and disables the saved source', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  await page.route('**/api/tanach/gematria-matches**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      results: [{ id: 'curated-one', text: 'שלום', bookSlug: 'genesis', bookName: 'בראשית', chapter: 1, verse: 1, start: 0, end: 4, type: 'whole_word' }],
      counts: { all: 1, whole_word: 1, whole_phrase: 0 }, total: 1, hasMore: false,
    }),
  }));
  await page.route('**/api/entries/curated-matches', async route => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON();
    expect(body.parentOriginalText).toBe('שלום');
    expect(body.matches[0].reasonCode).toBe('full_gematria');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, parentId: 91, parentCreated: true, matches: [],
    }) });
  });
  await page.locator('.heb-input').fill('שלום');
  const discovery = page.locator('.gematria-discovery');
  const card = discovery.locator('.match-card').first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'שמור התאמה' }).click();
  await expect(discovery.getByRole('status')).toContainText('החישוב וההתאמה נשמרו');
  await expect(card.getByRole('button', { name: 'נשמרה' })).toBeDisabled();
});

test('curated result save survives reload and prevents duplicate submission', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  const source = {
    id: 'persistent-curated-source', text: 'שלום', bookSlug: 'genesis',
    bookName: 'בראשית', chapter: 1, verse: 1, start: 0, end: 4, type: 'whole_word',
  };
  let saved = false;
  let postCount = 0;
  await page.route('**/api/tanach/gematria-matches**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      results: [source],
      counts: { all: 1, whole_word: 1, whole_phrase: 0 },
      total: 1, hasMore: false,
    }),
  }));
  await page.route('**/api/entries?**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('search') !== 'שלום') return route.continue();
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        entries: saved ? [{
          id: 501, original_text: 'שלום', normalized_text: 'שלום', tanach_book_slug: null,
          curated_matches: [{
            id: 901, originalText: source.text,
            tanachContext: {
              bookSlug: source.bookSlug, chapter: source.chapter, verse: source.verse,
              start: source.start, end: source.end,
            },
            reasonCodes: ['full_gematria'],
          }],
        }] : [],
        total: saved ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/entries/curated-matches', route => {
    postCount += 1;
    saved = true;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, parentId: 501, parentCreated: true, matches: [] }),
    });
  });

  await page.locator('.heb-input').fill('שלום');
  const action = page.locator('.match-card').first().getByRole('button', { name: 'שמור התאמה' });
  await action.click();
  await expect(page.locator('.match-card').first().getByRole('button', { name: 'נשמרה' })).toBeDisabled();
  expect(postCount).toBe(1);

  await page.reload();
  await expect(page.locator('.heb-input')).toBeVisible();
  await page.locator('.heb-input').fill('שלום');
  const persistedAction = page.locator('.match-card').first().getByRole('button', { name: 'נשמרה' });
  await expect(persistedAction).toBeDisabled();
  await persistedAction.click({ force: true });
  expect(postCount).toBe(1);
});

test('curated saved state permits another reason and another parent for the same source', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  const source = {
    id: 'shared-curated-source', text: 'שלום', bookSlug: 'genesis',
    bookName: 'בראשית', chapter: 1, verse: 1, start: 0, end: 4, type: 'whole_word',
  };
  await page.route('**/api/tanach/gematria-matches**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      results: [source],
      counts: { all: 1, whole_word: 1, whole_phrase: 0 },
      total: 1,
      hasMore: false,
    }),
  }));
  const requests = [];
  await page.route('**/api/entries/curated-matches', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, parentId: requests.length, parentCreated: false, matches: [] }),
    });
  });

  const input = page.locator('.heb-input');
  const discovery = page.locator('.gematria-discovery');
  await input.fill('שלום');
  const curatedAction = discovery.locator('.match-card').first().getByRole('button', { name: /שמור התאמה|נשמרה/ });
  await curatedAction.click();
  await expect(curatedAction).toHaveText(/נשמרה/);

  await discovery.getByRole('button', { name: 'ראשי תיבות' }).click();
  await expect(curatedAction).toHaveText(/שמור התאמה/);
  await curatedAction.click();

  await input.fill('שלומ');
  await expect(curatedAction).toHaveText(/שמור התאמה/);
  await curatedAction.click();

  await expect.poll(() => requests.length).toBe(3);
  expect(requests.map(item => item.matches[0].reasonCode))
    .toEqual(['full_gematria', 'initials_text', 'initials_text']);
  expect(requests.map(item => item.parentOriginalText)).toEqual(['שלום', 'שלום', 'שלומ']);
});

test('curated multi-select shows gold cards, supports cancel, and submits a bulk request', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await login(page);
  await page.route('**/api/tanach/gematria-matches**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      results: [
        { id: 'curated-a', text: 'שלום', bookSlug: 'genesis', chapter: 1, verse: 1, start: 0, end: 4, type: 'whole_word' },
        { id: 'curated-b', text: 'עולם', bookSlug: 'genesis', chapter: 1, verse: 2, start: 0, end: 4, type: 'whole_word' },
      ],
      counts: { all: 2, whole_word: 2, whole_phrase: 0 }, total: 2, hasMore: false,
    }),
  }));
  let requestBody;
  await page.route('**/api/entries/curated-matches', async route => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, parentId: 92, parentCreated: false, matches: [],
    }) });
  });
  await page.locator('.heb-input').fill('שלום');
  const discovery = page.locator('.gematria-discovery');
  await discovery.getByRole('button', { name: 'כולל' }).click();
  const cards = discovery.locator('.match-card');
  await cards.nth(0).getByRole('button', { name: 'שמור התאמה' }).click();
  await cards.nth(1).getByRole('button', { name: 'שמור התאמה' }).click();
  await expect(discovery.locator('.curated-selected-card')).toHaveCount(2);
  await discovery.getByRole('button', { name: 'ביטול' }).click();
  await expect(discovery.locator('.curated-selected-card')).toHaveCount(0);
  await cards.nth(0).getByRole('button', { name: 'שמור התאמה' }).click();
  await cards.nth(1).getByRole('button', { name: 'שמור התאמה' }).click();
  await discovery.getByRole('button', { name: 'שמור התאמות נבחרות' }).click();
  await expect.poll(() => requestBody?.matches?.length).toBe(2);
  expect(requestBody.matches.every(match => match.reasonCode === 'full_gematria')).toBe(true);
});
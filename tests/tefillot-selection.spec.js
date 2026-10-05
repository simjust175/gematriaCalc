import { test, expect } from '@playwright/test';
import { computeAll } from '../src/composables/useGematria.js';
import { calculateMilui, getCommonMiluiForms, MILUI_DEFAULT_MAPPING } from '../src/utils/milui.js';

test.use({ serviceWorkers: 'block' });
const prayer = 'שְׁמַע יִשְׂרָאֵל, ה׳ אֱלֹהֵינוּ ה׳ אֶחָד.';

async function openReader(page) {
  await page.route('**/api/base-words', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/auth/check', route => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/tefillot/availability', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/tefillot/catalog', route => route.fulfill({ json: {
    stats: { unit_count: 25 }, occasions: [{ slug: 'weekday', label: 'חול', services: [{
      slug: 'shacharit', label: 'שחרית', sections: [{ key: 'shema', label: 'ק״ש וברכותיה', unitCount: 25 }],
    }] }],
  } }));
  await page.route('**/api/tefillot/section?*', route => route.fulfill({ json: {
    section: Array.from({ length: 25 }, (_, index) => ({
      id: index + 1, sequence: index + 1, hebrew_text: index === 1 ? 'ברוך שם כבוד מלכותו לעולם ועד' : prayer,
      source_work: 'Browser fixture', source_version: 'Test', license: 'Public Domain', source_reference: 'Test',
    })),
  } }));
  await page.goto('/');
  await page.locator('.app-header').getByRole('button', { name: 'תפילות', exact: true }).click();
  await expect(page.locator('.prayer-text p')).toHaveCount(25);
  await page.locator('.prayer-text p').first().scrollIntoViewIfNeeded();
}

async function selectText(page, selector = '.prayer-text p', start = 0, end = null, endSelector = null) {
  return page.evaluate(({ selector, start, end, endSelector }) => {
    const first = document.querySelector(selector);
    const last = document.querySelector(endSelector || selector);
    function boundary(element, offset) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let remaining = offset;
      while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) return [node, remaining];
        remaining -= node.textContent.length;
      }
      throw new Error('Invalid test selection offset');
    }
    const range = document.createRange();
    range.setStart(...boundary(first, start));
    range.setEnd(...boundary(last, end ?? last.textContent.length));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return selection.toString();
  }, { selector, start, end, endSelector });
}

async function calculate(page) {
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  await page.getByRole('button', { name: 'חשב גימטריה' }).click();
  await expect(page.getByRole('dialog', { name: 'גימטריית הבחירה' })).toBeVisible();
}

async function assertResult(page, text) {
  const expected = computeAll(text);
  const dialog = page.getByRole('dialog', { name: 'גימטריית הבחירה' });
  await expect(dialog.locator('.selection-copy')).toHaveText(text, { useInnerText: false });
  expect(await dialog.locator('.selection-copy').textContent()).toBe(text);
  await expect(dialog.locator('.full-number')).toHaveText(expected.fullGematria.toLocaleString('he-IL'));
  await expect(dialog.locator('.inclusive-value strong')).toHaveText((expected.fullGematria + 1).toLocaleString('he-IL'));
  if (expected.words.length > 1) {
    await expect(dialog.locator('.derived-row').nth(0).locator('.derived-letters')).toHaveText(expected.initials);
    await expect(dialog.locator('.derived-row').nth(0).locator('.derived-number')).toHaveText(expected.initialsGematria.toLocaleString('he-IL'));
    await expect(dialog.locator('.derived-row').nth(1).locator('.derived-letters')).toHaveText(expected.finals);
    await expect(dialog.locator('.derived-row').nth(1).locator('.derived-number')).toHaveText(expected.finalsGematria.toLocaleString('he-IL'));
  } else await expect(dialog.locator('.derived-row')).toHaveCount(0);
}

test('reader is clean until a valid prayer selection; single word matches calculator', async ({ page }) => {
  await openReader(page);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  const text = await selectText(page, '.prayer-text p', 0, prayer.indexOf(' '));
  await calculate(page);
  await assertResult(page, text);
});

test('multiword pointed prayer and punctuation match canonical calculator fields', async ({ page }, testInfo) => {
  await openReader(page);
  const text = await selectText(page);
  await calculate(page);
  await assertResult(page, text);
  await page.screenshot({ path: testInfo.outputPath('prayer-selection-result.png'), animations: 'disabled' });
});

test('partial word retains the exact visible fragment, without expanding to whole words', async ({ page }) => {
  await openReader(page);
  const text = await selectText(page, '.prayer-text p', 0, 5);
  await calculate(page);
  await assertResult(page, text);
  expect(computeAll(text).fullGematria).toBe(340);
});

test('adjacent inline text nodes and adjacent prayer paragraphs remain contiguous', async ({ page }) => {
  await openReader(page);
  await page.locator('.prayer-text p').first().evaluate(element => {
    element.innerHTML = 'שְׁמַע <mark>יִשְׂרָאֵל</mark> ה׳';
  });
  let text = await selectText(page);
  await calculate(page);
  await assertResult(page, text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  text = await selectText(page, '.prayer-text p', 0, null, '.prayer-text p:nth-child(2)');
  await calculate(page);
  await assertResult(page, text);
});

test('sidebar, header, source UI and mixed prayer/chrome selections never show an action', async ({ page }) => {
  await openReader(page);
  for (const selector of ['.navigator h1', '.reader-heading h2', '.app-header', '.source-card summary']) {
    await selectText(page, selector);
    await page.waitForTimeout(250);
    await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  }
  await selectText(page, '.reader-heading h2', 0, 5, '.prayer-text p');
  await page.waitForTimeout(250);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('whitespace, punctuation and intervening UI are rejected', async ({ page }) => {
  await openReader(page);
  await page.locator('.prayer-text p').first().evaluate(element => { element.textContent = ' \n ,׳ '; });
  await selectText(page);
  await page.waitForTimeout(250);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  await page.locator('.prayer-text p').first().evaluate(element => { element.innerHTML = 'שמע <button>ישראל</button> אחד'; });
  await selectText(page);
  await page.waitForTimeout(250);
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('new selection resets results; collapsed selection, Escape and outside clicks dismiss cleanly', async ({ page }) => {
  await openReader(page);
  await selectText(page);
  await calculate(page);
  await page.waitForTimeout(350);
  await selectText(page, '.prayer-text p', 0, 5);
  await expect(page.getByRole('dialog', { name: 'גימטריית הבחירה' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  await selectText(page);
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
  await selectText(page);
  await calculate(page);
  await page.locator('.reader-heading').click();
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('viewport resizing clamps the result; scrolling dismisses instead of detaching it', async ({ page }) => {
  await openReader(page);
  await selectText(page);
  await calculate(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect.poll(async () => {
    const bounds = await page.locator('[data-selection-popover]').boundingBox();
    return Boolean(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 768 && bounds.y + bounds.height <= 1024);
  }).toBe(true);
  await page.evaluate(() => window.scrollBy(0, 100));
  await expect(page.locator('[data-selection-popover]')).toHaveCount(0);
});

test('touch selection preserves native selection and exposes a viewport-contained action', async ({ page }) => {
  await openReader(page);
  const text = await selectText(page);
  await page.locator('.prayer-text').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 3 });
  await page.locator('.prayer-text').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 3 });
  await expect(page.getByRole('button', { name: 'חשב גימטריה' })).toBeVisible();
  expect(await page.evaluate(() => window.getSelection().toString())).toBe(text);
  const bounds = await page.locator('[data-selection-popover]').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  await calculate(page);
  await assertResult(page, text);
});

test('long contiguous ranges retain exact display text and do not overflow the result card', async ({ page }) => {
  await openReader(page);
  const text = await selectText(page, '.prayer-text p', 0, null, '.prayer-text p:nth-child(25)');
  await calculate(page);
  await assertResult(page, text);
  await expect.poll(async () => page.locator('[data-selection-popover]').evaluate(element =>
    element.scrollWidth <= element.clientWidth + 1
    && element.getBoundingClientRect().bottom <= window.innerHeight + 1,
  )).toBe(true);
});

test('subtle save reuses the existing originalText API and supports duplicate and retry states', async ({ page }) => {
  await openReader(page);
  let status = 503;
  let payload;
  await page.route('**/api/entries', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status, json: {} });
  });
  const text = await selectText(page);
  await calculate(page);
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('לא ניתן לשמור');
  status = 409;
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await expect(page.getByRole('button', { name: 'כבר שמור' })).toBeDisabled();
  expect(payload).toEqual({ originalText: text });
  await page.waitForTimeout(350);
  const fragment = await selectText(page, '.prayer-text p', 0, 5);
  await calculate(page);
  status = 201;
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await expect(page.getByRole('button', { name: 'נשמר', exact: true })).toBeDisabled();
  expect(payload).toEqual({ originalText: fragment });
});

test('Yesod checks canonical existing status without creating another entry', async ({ page }) => {
  await openReader(page);
  let posts = 0;
  await page.route('**/api/base-words', route => {
    if (route.request().method() === 'POST') posts++;
    return route.fulfill({ json: { items: [{ id: 1, normalizedText: computeAll(prayer).normalizedText }] } });
  });
  await selectText(page);
  await calculate(page);
  await expect(page.getByRole('button', { name: 'כבר שמור כיסוד' })).toBeDisabled();
  expect(posts).toBe(0);
  await expect(page.getByRole('button', { name: 'שמור', exact: true })).toBeEnabled();
});

test('Yesod shared save keeps exact text, retries failures and handles a duplicate race', async ({ page }) => {
  await openReader(page);
  let status = 503;
  let payload;
  await page.route('**/api/base-words', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { items: [] } });
    payload = route.request().postDataJSON();
    return route.fulfill({ status, json: {} });
  });
  await page.locator('.prayer-text p').first().evaluate(el => { el.textContent = '  שְׁמַע, ישראל!  '; });
  const text = await selectText(page);
  await calculate(page);
  await page.getByRole('button', { name: 'שמור כיסוד', exact: true }).click();
  await expect(page.locator('.yesod-error')).toContainText('לא ניתן לשמור');
  status = 409;
  await page.getByRole('button', { name: 'שמור כיסוד', exact: true }).click();
  await expect(page.getByRole('button', { name: 'כבר שמור כיסוד' })).toBeDisabled();
  expect(payload).toEqual({ originalText: text });
});

test('Yesod prayer save persists through real existing API and appears in normal collection/matches', async ({ page }) => {
  await openReader(page);
  await page.unroute('**/api/base-words');
  const login = await page.request.post('/api/auth/login', {
    data: { password: process.env.E2E_APP_PASSWORD || 'tanach-browser-test-password' },
  });
  expect(login.ok()).toBe(true);
  const original = await page.request.get('/api/base-words');
  for (const item of (await original.json()).items) {
    if (item.normalizedText === computeAll(prayer).normalizedText) await page.request.delete(`/api/base-words/${item.id}`);
  }
  const text = await selectText(page);
  await calculate(page);
  await page.getByRole('button', { name: 'שמור כיסוד', exact: true }).click();
  await expect(page.locator('.yesod-button')).toBeDisabled();
  await expect(page.locator('.yesod-button')).toHaveText(/^(נשמר כיסוד|כבר שמור כיסוד)$/);
  const list = await page.request.get('/api/base-words');
  const saved = (await list.json()).items.filter(item => item.normalizedText === computeAll(text).normalizedText);
  expect(saved).toHaveLength(1);
  const item = saved[0];
  try {
    expect(item.originalText).toBe(text);
    const matches = await page.request.get(`/api/base-words/matches?value=${computeAll(text).fullGematria}`);
    expect((await matches.json()).results.some(match => match.id === item.id)).toBe(true);
    const duplicate = await page.request.post('/api/base-words', { data: { originalText: computeAll(text).normalizedText } });
    expect(duplicate.status()).toBe(409);
    await page.locator('.app-header').getByRole('button', { name: 'מילות יסוד', exact: true }).click();
    await expect(page.locator('.word-row').filter({ hasText: text })).toHaveCount(1);
  } finally {
    await page.request.delete(`/api/base-words/${item.id}`);
  }
});

for (const [label, sample] of [
  ['pointed punctuation and final letters', prayer],
  ['partial word', 'שְׁמַ'],
  ['Havayah', 'יְהוָה'],
]) {
  test(`Milui honors canonical customized settings: ${label}`, async ({ page }) => {
    await openReader(page);
    const mapping = { ...MILUI_DEFAULT_MAPPING, ה: 'הי', ו: 'ויו' };
    await page.route('**/api/settings/milui', route => route.fulfill({ json: { mapping } }));
    await page.locator('.prayer-text p').first().evaluate((el, text) => { el.textContent = text; }, sample);
    const text = await selectText(page);
    await calculate(page);
    await page.locator('.milui-trigger').click();
    const expected = calculateMilui(text, mapping);
    await expect(page.locator('.milui-number')).toHaveText(expected.fullGematria.toLocaleString('he-IL'));
    await expect(page.locator('.milui-expansion')).toHaveText(expected.expandedText);
    await expect(page.locator('.milui-filling strong')).toHaveText(expected.fillingOnlyGematria.toLocaleString('he-IL'));
    for (const [index, form] of getCommonMiluiForms(text, mapping).entries()) {
      await expect(page.locator('.milui-list:not(.havayah-list) .milui-form-value').nth(index))
        .toHaveText(form.calculation.fullGematria.toLocaleString('he-IL'));
    }
    if (label === 'Havayah') {
      await expect(page.locator('.havayah-list .milui-form-value')).toHaveText(['72', '63', '45', '52']);
    }
    await assertResult(page, text);
    expect(await page.evaluate(() => window.getSelection().toString())).toBe(text);
    const bounds = await page.locator('[data-selection-popover]').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
  });
}

test('Milui never substitutes defaults when settings fail or are invalid; retry works', async ({ page }) => {
  await openReader(page);
  let mapping = { ה: 'invalid' };
  await page.route('**/api/settings/milui', route => route.fulfill({ json: { mapping } }));
  await selectText(page);
  await calculate(page);
  await page.locator('.milui-trigger').click();
  await expect(page.locator('.milui-error')).toContainText('לא ניתן לטעון');
  await expect(page.locator('.milui-number')).toHaveCount(0);
  mapping = MILUI_DEFAULT_MAPPING;
  await page.locator('.milui-error button').click();
  await expect(page.locator('.milui-number')).toHaveText(calculateMilui(prayer).fullGematria.toLocaleString('he-IL'));
});

test('native gold selection is limited to prayer units and survives popup interactions', async ({ page }) => {
  await openReader(page);
  await page.locator('.prayer-text p').first().evaluate(el => { el.innerHTML = '<span>שְׁמַע</span> ישראל'; });
  const text = await selectText(page);
  await calculate(page);
  const style = await page.evaluate(() => {
    const color = selector => {
      const computed = getComputedStyle(document.querySelector(selector), '::selection');
      return { background: computed.backgroundColor, color: computed.color };
    };
    return { prayer: color('[data-prayer-unit]'), child: color('[data-prayer-unit] span'), heading: color('.reader-heading'), nav: color('.nav-btn') };
  });
  expect(style.prayer).toEqual({ background: 'rgb(232, 217, 173)', color: 'rgb(26, 39, 68)' });
  expect(style.child).toEqual(style.prayer);
  expect(style.heading.background).not.toBe(style.prayer.background);
  expect(style.nav.background).not.toBe(style.prayer.background);
  expect(await page.evaluate(() => window.getSelection().toString())).toBe(text);
  await page.route('**/api/settings/milui', route => route.fulfill({ json: { mapping: MILUI_DEFAULT_MAPPING } }));
  await page.locator('.milui-trigger').click();
  await expect(page.locator('.milui-number')).toBeVisible();
  expect(await page.evaluate(() => window.getSelection().toString())).toBe(text);
});

test('Milui chips instantly select one, several, or all types without changing calculations or saves', async ({ page }, testInfo) => {
  await openReader(page);
  await page.route('**/api/settings/milui', route => route.fulfill({ json: { mapping: MILUI_DEFAULT_MAPPING } }));
  const text = await selectText(page);
  await calculate(page);
  await page.locator('.milui-trigger').click();
  const filters = page.getByRole('group', { name: 'סינון סוגי מילוי' });
  const all = filters.getByRole('button', { name: 'הכל', exact: true });
  const primary = filters.getByRole('button', { name: 'מילוי רגיל', exact: true });
  const av = filters.getByRole('button', { name: 'מילוי יודי״ן', exact: true });
  const sag = filters.getByRole('button', { name: 'מילוי יודי״ן־אל״ף', exact: true });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.milui-list .milui-result-row')).toHaveCount(4);
  await av.click();
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(av).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.milui-list .milui-result-row')).toHaveCount(1);
  await expect(page.locator('.milui-primary')).toHaveCount(0);
  const forms = getCommonMiluiForms(text);
  await expect(page.locator('.milui-form-value')).toHaveText(forms.find(form => form.id === 'av').calculation.fullGematria.toLocaleString('he-IL'));
  await sag.click();
  await expect(page.locator('.milui-list .milui-result-row')).toHaveCount(2);
  await expect(av).toHaveAttribute('aria-pressed', 'true');
  await expect(sag).toHaveAttribute('aria-pressed', 'true');
  await av.click();
  await expect(page.locator('.milui-list .milui-result-row')).toHaveCount(1);
  await sag.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.milui-list .milui-result-row')).toHaveCount(4);
  await primary.click();
  await expect(page.locator('.milui-list .milui-result-row')).toHaveCount(1);
  await expect(page.locator('.milui-number')).toHaveText(calculateMilui(text).fullGematria.toLocaleString('he-IL'));
  await expect(page.locator('.milui-filling')).toBeVisible();
  await sag.click();
  await all.click();
  await expect(primary).toHaveAttribute('aria-pressed', 'false');
  await expect(sag).toHaveAttribute('aria-pressed', 'false');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await assertResult(page, text);
  await expect(page.getByRole('button', { name: 'שמור', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'שמור כיסוד', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.getSelection().toString())).toBe(text);
  await page.screenshot({ path: `screenshots/milui-filter-${testInfo.project.name}.png` });
  await av.click();
  await page.locator('.milui-trigger').click();
  await page.locator('.milui-trigger').click();
  await expect(av).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(350);
  await selectText(page, '.prayer-text p', 0, 5);
  await calculate(page);
  await page.locator('.milui-trigger').click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
});

test('shared common/Havayah type chips filter both result sets without duplicate chips', async ({ page }) => {
  await openReader(page);
  await page.route('**/api/settings/milui', route => route.fulfill({ json: { mapping: MILUI_DEFAULT_MAPPING } }));
  await page.locator('.prayer-text p').first().evaluate(el => { el.textContent = 'יְהוָה'; });
  await selectText(page);
  await calculate(page);
  await page.locator('.milui-trigger').click();
  const filters = page.getByRole('group', { name: 'סינון סוגי מילוי' });
  await expect(filters.getByRole('button')).toHaveCount(6);
  const av = filters.getByRole('button', { name: 'מילוי יודי״ן', exact: true });
  await expect(av).toHaveCount(1);
  await av.click();
  await expect(page.locator('.milui-list:not(.havayah-list) .milui-result-row')).toHaveCount(1);
  await expect(page.locator('.havayah-list .milui-result-row')).toHaveCount(1);
  await expect(page.locator('.havayah-list .milui-form-value')).toHaveText('72');
  await av.click();
  await filters.getByRole('button', { name: 'מילוי אלפי״ן', exact: true }).click();
  await expect(page.locator('.milui-list:not(.havayah-list)')).toHaveCount(0);
  await expect(page.locator('.milui-primary')).toHaveCount(0);
  await expect(page.locator('.havayah-list .milui-result-row')).toHaveCount(1);
  await expect(page.locator('.havayah-list .milui-form-value')).toHaveText('45');
});

test('one available Milui type hides filters; changing available types cannot leave empty results', async ({ page }) => {
  // Mount the real component with its public props to cover the one-type state,
  // which the ordinary canonical engine's four common forms do not produce.
  await page.goto('/');
  const calculation = calculateMilui('אב');
  const forms = getCommonMiluiForms('אב');
  await page.evaluate(async ({ calculation, forms }) => {
    const url = '/src/components/SelectionGematriaPopover.vue';
    const source = await (await fetch(url)).text();
    const vueUrl = source.match(/from\s+["']([^"']*\/vue\.js[^"']*)["']/)?.[1];
    if (!vueUrl) throw new Error('Cannot locate component Vue runtime');
    const { createApp, h, reactive } = await import(vueUrl);
    const { default: Popover } = await import(url);
    const props = reactive({
      mode: 'result', text: 'אב', miluiCalculation: calculation,
      miluiForms: [forms[0]], miluiState: 'ready', position: { left: 12, top: 12 },
    });
    const host = document.createElement('div');
    document.body.append(host);
    createApp({ render: () => h(Popover, props) }).mount(host);
    window.updateMiluiTestProps = patch => Object.assign(props, patch);
  }, { calculation, forms });
  await page.locator('.milui-trigger').click();
  await expect(page.getByRole('group', { name: 'סינון סוגי מילוי' })).toHaveCount(0);
  await expect(page.locator('.milui-number')).toHaveText(calculation.fullGematria.toLocaleString('he-IL'));
  await page.evaluate(forms => window.updateMiluiTestProps({ miluiForms: forms }), forms);
  const filters = page.getByRole('group', { name: 'סינון סוגי מילוי' });
  await expect(filters).toBeVisible();
  await filters.getByRole('button', { name: 'מילוי יודי״ן', exact: true }).click();
  await expect(page.locator('.milui-primary')).toHaveCount(0);
  await page.evaluate(form => window.updateMiluiTestProps({ miluiForms: [form] }), forms[0]);
  await expect(filters).toHaveCount(0);
  await expect(page.locator('.milui-number')).toHaveText(calculation.fullGematria.toLocaleString('he-IL'));
  await expect(page.locator('.milui-result-row')).toHaveCount(1);
});

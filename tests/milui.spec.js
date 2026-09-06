import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="password"]').fill('tanach-browser-test-password');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.locator('.heb-input')).toBeVisible();
}

test('מילוי stays optional, updates live, persists edits, and resets safely', async ({ page }) => {
  await login(page);
  const input = page.locator('.heb-input');
  const toggle = page.locator('.milui-toggle');

  await input.fill('אב');
  await expect(page.locator('.milui-panel')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.milui-disclosure')).toBeVisible();
  await expect(toggle.locator('.advanced-toggle__subtitle')).toHaveText('חישוב לפי שמות האותיות');
  await expect(page.locator('.base-toggle small')).toHaveText('כניסות שלמות בלבד');

  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.milui-expanded-text')).toHaveText('אלף בית');
  await expect(page.locator('.milui-value')).toContainText('523');
  await expect(page.locator('.milui-secondary-value')).toContainText('520');
  await page.getByRole('button', { name: 'פירוט' }).click();
  await expect(page.locator('.milui-details')).toBeVisible();

  await input.fill('א');
  await expect(page.locator('.milui-expanded-text')).toHaveText('אלף');
  await expect(page.locator('.milui-value')).toContainText('111');
  await expect(page.locator('.milui-details')).toHaveCount(0);

  await toggle.press('Space');
  await expect(page.locator('.milui-panel')).toHaveCount(0);
  await input.fill('ב');
  await expect(page.locator('.milui-panel')).toHaveCount(0);

  await toggle.click();
  await expect(page.locator('.milui-expanded-text')).toHaveText('בית');
  await page.getByRole('button', { name: 'שנה מילוי' }).click();
  await expect(page.getByText('התאמת מילוי', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'הגדרות מילוי' }).click();
  const dialog = page.getByRole('dialog', { name: 'הגדרות מילוי' });
  await expect(dialog).toBeVisible();
  const closeButton = dialog.getByRole('button', { name: 'סגור הגדרות מילוי' });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'שמור שינויים' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  const vavInput = dialog.locator('.milui-row__input').nth(5);
  await expect(vavInput).toHaveValue('ואו');
  await vavInput.fill('ויו');
  await dialog.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(vavInput).toHaveValue('ויו');
  await expect(dialog.getByRole('status')).toHaveText('הגדרות המילוי עודכנו');
  await dialog.getByRole('button', { name: 'סגור הגדרות מילוי' }).click();

  await input.fill('ו');
  await expect(page.locator('.milui-expanded-text')).toHaveText('ויו');
  await input.fill('יהוה');
  await page.getByRole('button', { name: 'שנה מילוי' }).click();
  const canonical = page.locator('.havayah-milui');
  await expect(canonical.getByRole('heading', { name: 'מילויי הוי״ה' })).toBeVisible();
  await expect(canonical.getByRole('button')).toHaveCount(4);
  await expect(canonical).toContainText('ע״ב');
  await expect(canonical).toContainText('72');
  await expect(canonical).toContainText('ס״ג');
  await expect(canonical).toContainText('63');
  await expect(canonical).toContainText('מ״ה');
  await expect(canonical).toContainText('45');
  await expect(canonical).toContainText('ב״ן');
  await expect(canonical).toContainText('52');

  await page.reload();
  await expect(input).toBeVisible();
  await input.fill('ו');
  await toggle.click();
  await expect(page.locator('.milui-expanded-text')).toHaveText('ויו');

  await page.getByRole('button', { name: 'שנה מילוי' }).click();
  await page.getByRole('button', { name: 'הגדרות מילוי' }).click();
  const reloadedDialog = page.getByRole('dialog', { name: 'הגדרות מילוי' });
  page.once('dialog', confirmation => confirmation.accept());
  await reloadedDialog.getByRole('button', { name: 'החזר לברירת מחדל' }).click();
  await expect(reloadedDialog.locator('.milui-row__input').nth(5)).toHaveValue('ואו');
  await reloadedDialog.getByRole('button', { name: 'סגור הגדרות מילוי' }).click();
  await expect(page.locator('.milui-expanded-text')).toHaveText('ואו');

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

test('canonical מילויי הוי״ה appears only for a normalized standalone Name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const input = page.locator('.heb-input');
  await input.fill('שלום');
  await page.locator('.milui-toggle').click();
  await expect(page.locator('.havayah-milui')).toHaveCount(0);

  await input.fill('ברוך אתה יְהֹוָה');
  await page.getByRole('button', { name: 'שנה מילוי' }).click();
  const canonical = page.locator('.havayah-milui');
  await expect(canonical).toHaveCount(1);
  const options = canonical.getByRole('button');
  await expect(options).toHaveCount(4);
  await expect(options.first()).toHaveAttribute('aria-pressed', 'false');

  await options.first().click();
  await expect(options.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(canonical.locator('.havayah-spelling')).toHaveText('יו״ד ה״י וי״ו ה״י');

  await options.nth(1).click();
  await expect(options.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(canonical.locator('.havayah-spelling')).toHaveText('יו״ד ה״י וא״ו ה״י');

  await options.nth(1).click();
  await expect(canonical.locator('.havayah-spelling')).toHaveCount(0);

  await input.fill('אביהוה');
  await expect(page.locator('.havayah-milui')).toHaveCount(0);
  await input.fill('י.ה.ו.ה יהוה');
  await page.getByRole('button', { name: 'שנה מילוי' }).click();
  await expect(page.locator('.havayah-milui')).toHaveCount(1);

  const gridColumns = await canonical.locator('.havayah-options').evaluate(
    element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
  );
  expect(gridColumns).toBe(2);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

test('מילוי variants stay compact, track repeated occurrences independently, and save exactly', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const input = page.locator('.heb-input');
  const phrase = testInfo.project.name.includes('mobile') ? 'ההו ב' : 'ההו א';
  await input.fill('אב');
  await page.locator('.milui-toggle').click();
  await expect(page.getByRole('button', { name: 'שנה מילוי' })).toBeVisible();
  await expect(page.getByRole('button', { name: /אפשרויות מילוי/ })).toHaveCount(0);

  await input.fill(phrase);
  await page.getByRole('button', { name: 'שנה מילוי' }).click();

  const composer = page.locator('#milui-variant-composer');
  const groups = composer.getByRole('radiogroup');
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0).getByRole('radio')).toHaveCount(3);
  await expect(groups.nth(1).getByRole('radio')).toHaveCount(3);
  await expect(groups.nth(2).getByRole('radio')).toHaveCount(3);
  await expect(composer.locator('.milui-selected-result')).toHaveCount(1);

  await expect(groups.nth(0).getByRole('radio', { name: /ה״א/ })).toHaveAttribute('aria-checked', 'true');
  await expect(groups.nth(1).getByRole('radio', { name: /ה״א/ })).toHaveAttribute('aria-checked', 'true');
  await expect(groups.nth(2).getByRole('radio', { name: /וא״ו/ })).toHaveAttribute('aria-checked', 'true');
  await expect(groups.nth(0).getByRole('radio', { name: /ה״א/ })).toHaveAttribute('tabindex', '0');
  await expect(groups.nth(0).getByRole('radio', { name: /ה״י/ })).toHaveAttribute('tabindex', '-1');
  await groups.nth(0).getByRole('radio', { name: /ה״א/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(groups.nth(0).getByRole('radio', { name: /ה״י/ })).toBeFocused();
  await expect(groups.nth(0).getByRole('radio', { name: /ה״י/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(groups.nth(0).getByRole('radio', { name: /ה״א/ })).toBeFocused();
  await expect(groups.nth(0).getByRole('radio', { name: /ה״א/ })).toHaveAttribute('aria-checked', 'true');
  const initialTotal = await composer.locator('.milui-selected-result__value').textContent();

  await groups.nth(0).getByRole('radio', { name: /ה״י/ }).click();
  await expect(groups.nth(0).getByRole('radio', { name: /ה״י/ })).toHaveAttribute('aria-checked', 'true');
  await expect(groups.nth(1).getByRole('radio', { name: /ה״א/ })).toHaveAttribute('aria-checked', 'true');
  await expect(composer.locator('.milui-selected-result__value')).not.toHaveText(initialTotal.trim());

  await groups.nth(1).getByRole('radio', { name: /ה״ה/ }).click();
  await expect(groups.nth(0).getByRole('radio', { name: /ה״י/ })).toHaveAttribute('aria-checked', 'true');
  await expect(groups.nth(1).getByRole('radio', { name: /ה״ה/ })).toHaveAttribute('aria-checked', 'true');

  const save = composer.getByRole('button', { name: 'שמור מילוי זה' });
  await save.click();
  await expect(composer.getByRole('status')).toHaveText('המילוי נשמר');
  await expect(page.locator('.match-badge--milui:visible')).toHaveCount(1);

  await expect.poll(async () => composer.getByRole('button').filter({ hasText: 'שמור מילוי זה' }).count()).toBe(1);
  await composer.getByRole('button', { name: 'שמור מילוי זה' }).click();
  await expect(composer.getByRole('status')).toHaveText('כבר נשמר');

  await groups.nth(2).getByRole('radio', { name: /ו״ו/ }).click();
  await expect(composer.getByRole('button', { name: 'שמור מילוי זה' })).toBeEnabled();
  await composer.getByRole('button', { name: 'שמור מילוי זה' }).click();
  await expect(composer.getByRole('status')).toHaveText('המילוי נשמר');

  const listed = await page.request.get(
    `/api/milui-interpretations?normalizedText=${encodeURIComponent(phrase)}`
  );
  expect(listed.ok()).toBe(true);
  const payload = await listed.json();
  expect(payload.interpretations).toHaveLength(2);
  expect(payload.interpretations[0].selections).toHaveLength(3);

  await page.locator('.milui-toggle').click();
  await expect(page.locator('.match-badge--milui:visible')).toHaveCount(0);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});
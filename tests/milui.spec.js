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
  await expect(page.locator('.multiple-toggle .advanced-toggle__subtitle')).toHaveText('קשרים מספריים מדויקים');

  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.milui-expanded-text')).toHaveText('אלף בית');
  await expect(page.locator('.milui-value')).toContainText('523');
  await expect(page.locator('.milui-secondary-value')).toContainText('520');

  await input.fill('א');
  await expect(page.locator('.milui-expanded-text')).toHaveText('אלף');
  await expect(page.locator('.milui-value')).toContainText('111');

  await toggle.press('Space');
  await expect(page.locator('.milui-panel')).toHaveCount(0);
  await input.fill('ב');
  await expect(page.locator('.milui-panel')).toHaveCount(0);

  await toggle.click();
  await expect(page.locator('.milui-expanded-text')).toHaveText('בית');
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
  await dialog.getByRole('button', { name: 'סגור הגדרות מילוי' }).click();

  await input.fill('ו');
  await expect(page.locator('.milui-expanded-text')).toHaveText('ויו');

  await page.reload();
  await expect(input).toBeVisible();
  await input.fill('ו');
  await toggle.click();
  await expect(page.locator('.milui-expanded-text')).toHaveText('ויו');

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
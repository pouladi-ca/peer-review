import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * The admin invites a colleague, who signs in with the temporary password, is made to
 * choose their own, and sees an empty library: reviews are private to their owner.
 */
test('an admin can add a person who must set a password and sees only their own reviews', async ({ page }) => {
  await login(page);
  // The admin has at least one review from the other tests, or makes one now.
  if ((await page.locator('.review-card').count()) === 0) {
    await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
    await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Library' }).click();
  }
  const adminReviews = await page.locator('.review-card').count();
  expect(adminReviews).toBeGreaterThan(0);

  await page.locator('.account-btn').click();
  await page.getByRole('menuitem', { name: /Manage people/ }).click();
  const dialog = page.getByRole('dialog', { name: 'People' });
  await expect(dialog).toBeVisible();
  const colleague = `colleague-${Date.now()}@example.org`;
  await dialog.getByLabel('Email of the person to add').fill(colleague);
  await dialog.getByRole('button', { name: /Add person/ }).click();
  const temp = (await dialog.locator('.temp-pass-code').textContent())!.trim();
  expect(temp).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
  await expect(dialog.locator('.admin-table')).toContainText(colleague);
  await page.keyboard.press('Escape');

  // Sign out, sign in as the colleague: the forced password change appears.
  await page.locator('.account-btn').click();
  await page.getByRole('menuitem', { name: 'Sign out of this device' }).click();
  await expect(page.getByLabel('Password')).toBeVisible();
  await page.getByLabel('Email').fill(colleague);
  await page.getByLabel('Password').fill(temp);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('Temporary password').fill(temp);
  await page.getByLabel('New password', { exact: true }).fill('a-sentence-i-will-remember');
  await page.getByLabel('New password again').fill('a-sentence-i-will-remember');
  await page.getByRole('button', { name: /Set password and continue/ }).click();

  // Their library is empty and has no people menu; the admin's reviews stayed the admin's.
  await expect(page.locator('.library-main')).toBeVisible();
  await expect(page.locator('.review-card')).toHaveCount(0);
  await page.locator('.account-btn').click();
  await expect(page.getByRole('menuitem', { name: /Manage people/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Sign out of this device' }).click();

  // The temporary password is dead; the chosen one works.
  await page.getByLabel('Email').fill(colleague);
  await page.getByLabel('Password').fill(temp);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/not right/i);
  await page.getByLabel('Password').fill('a-sentence-i-will-remember');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.library-main')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toHaveCount(0);
  await page.locator('.account-btn').click();
  await page.getByRole('menuitem', { name: 'Sign out of this device' }).click();

  await login(page);
  await expect(page.locator('.review-card')).toHaveCount(adminReviews);
});

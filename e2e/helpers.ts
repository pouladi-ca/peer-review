import { expect, type Page } from '@playwright/test';

export const E2E_PASSWORD = 'e2e-password';

/** Sign in if the gate is showing, then wait for the library. */
export async function login(page: Page): Promise<void> {
  await page.goto('/');
  const field = page.getByLabel('Password');
  if (await field.isVisible({ timeout: 3000 }).catch(() => false)) {
    await field.fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('heading', { name: /Read closely/i })).toBeVisible();
}

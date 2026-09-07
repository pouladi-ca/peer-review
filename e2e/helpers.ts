import { expect, type Page } from '@playwright/test';

export const E2E_EMAIL = 'reviewer@example.org';
export const E2E_PASSWORD = 'e2e-password';

/** Sign in (as the seeded admin unless told otherwise) if the gate is showing, then wait for the library. */
export async function login(page: Page, email = E2E_EMAIL, password = E2E_PASSWORD): Promise<void> {
  await page.goto('/');
  const field = page.getByLabel('Password');
  if (await field.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByLabel('Email').fill(email);
    await field.fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  // The hero heading hides on phones once reviews exist; the library main is always there.
  await expect(page.locator('.library-main')).toBeVisible();
}

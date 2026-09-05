import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from './helpers';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(dir, '..', 'screenshots');

/** Runs in the "phone" project (iPhone 13 viewport, touch). */
test('a phone gets the tab bar, sheets, and a docked tagging toolbar', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tabbar')).toBeVisible();
  // The document fills the width: no navigator or panel column.
  await expect(page.locator('.nav')).toHaveCount(0);
  await expect(page.locator('.panel')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, '15-phone-reader.png') });

  // Contents sheet.
  await page.getByRole('button', { name: 'Contents' }).click();
  await expect(page.locator('.sheet .outline')).toBeVisible();
  await page.locator('.outline-item', { hasText: 'Specific Aims' }).click();
  await page.locator('.scrim').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('.sheet')).toHaveCount(0);
  await page.waitForTimeout(900); // let the smooth scroll from the outline tap settle

  // Select text; on touch the toolbar docks at the bottom.
  const span = page.locator('.textLayer span').filter({ hasText: /stroke|astrocyte|repair|aims/i }).first();
  await expect(span).toBeVisible();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
  });
  const toolbar = page.locator('.sel-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveClass(/is-docked/);
  const box = (await toolbar.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(viewport.height * 0.7);
  await page.screenshot({ path: path.join(shots, '16-phone-selection.png') });

  // Tagging opens the Notes sheet with the new note.
  await toolbar.locator('.sel-weakness').click();
  await expect(page.locator('.sheet .note.is-selected')).toBeVisible();
  await page.locator('.sheet .note.is-selected .note-comment').fill('Tagged on a phone');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, '17-phone-note.png') });

  // Score sheet works too.
  await page.locator('.tabbar-btn', { hasText: 'Score' }).click();
  await expect(page.locator('.sheet .criterion').first()).toBeVisible();
});

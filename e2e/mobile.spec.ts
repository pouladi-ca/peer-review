import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from './helpers';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(dir, '..', 'screenshots');

/** Runs in the "phone" project (iPhone 13 viewport, touch). */
test('the phone library is compact and never overflows', async ({ page }) => {
  await login(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Add a proposal PDF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.screenshot({ path: path.join(shots, '19-phone-library.png') });
});

test('the view toggle stays within reach and switches both ways on a phone', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
  const toggle = page.getByRole('radiogroup', { name: 'View' });
  await expect(toggle).toBeVisible();
  const box = (await toggle.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  await page.getByRole('radio', { name: 'Pages' }).click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  const box2 = (await toggle.boundingBox())!;
  expect(box2.x + box2.width).toBeLessThanOrEqual(vw);
  await page.screenshot({ path: path.join(shots, '20-phone-pages.png') });
  await page.getByRole('radio', { name: 'Read' }).click();
  await expect(page.locator('.read-content')).toBeVisible({ timeout: 60_000 });
  // The "more" menu holds the secondary controls.
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('menuitem', { name: /Sign out/ })).toBeVisible();
  const menu = (await page.locator('.more-pop').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '21-phone-more.png') });
});

test('a phone gets the tab bar, sheets, and a docked tagging toolbar', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.viewer')).toBeVisible();
  // The document fills the width: no navigator or panel column.
  await expect(page.locator('.nav')).toHaveCount(0);
  await expect(page.locator('.panel')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, '15-phone-reader.png') });

  // Contents sheet.
  await page.getByRole('button', { name: 'Contents' }).click();
  await expect(page.locator('.sheet .outline')).toBeVisible({ timeout: 60_000 });
  await page.locator('.outline-item', { hasText: 'Specific Aims' }).click();
  await page.locator('.scrim').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('.sheet')).toHaveCount(0);
  await page.waitForTimeout(900); // let the smooth scroll from the outline tap settle

  // Phones default to the reading view; wait for the reflow to be served.
  const content = page.locator('.read-content');
  await expect(content).toBeVisible({ timeout: 60_000 });
  await expect(content.locator('h2', { hasText: 'Specific Aims' })).toBeVisible();

  // Select text in the reading view; on touch the toolbar docks at the bottom.
  const para = content.locator('p').filter({ hasText: /Stroke affects more than 12 million/ }).first();
  await para.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await para.evaluate((el) => {
    const text = el.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 40);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
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

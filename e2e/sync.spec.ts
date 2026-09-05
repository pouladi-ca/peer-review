import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Two browser contexts stand in for two devices. A review created and annotated on the
 * first must appear, with its PDF and note, on the second within the polling interval,
 * and a score entered on the second must come back to the first.
 */
test('a review syncs between two devices', async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  await login(pageA);
  await pageA.getByRole('button', { name: 'Try a sample application', exact: true }).click();
  await expect(pageA.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  // A unique title, so device B can tell this review from earlier tests' copies.
  const title = `Sync test ${Date.now()}`;
  await pageA.locator('.title-input').fill(title);
  // Tag a passage on device A.
  const span = pageA.locator('.textLayer span').filter({ hasText: /stroke|astrocyte|repair/i }).first();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await pageA.locator('.sel-toolbar .sel-strength').click();
  await pageA.locator('.note.is-selected .note-comment').fill('Synced from device A');
  await expect(pageA.locator('.sync-state')).toContainText(/Synced/, { timeout: 15_000 });

  // Device B signs in and sees the review in its library.
  await login(pageB);
  // Newest first: the review this test just created is the first matching card.
  const card = pageB.locator('.review-card', { hasText: title });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.locator('.review-card-main').click();
  // The PDF was downloaded from the server and the note is present.
  await expect(pageB.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  await pageB.locator('.panel-tab', { hasText: 'Notes' }).click();
  await expect(pageB.locator('.note')).toHaveCount(1, { timeout: 20_000 });
  await expect(pageB.locator('.note .note-comment')).toHaveValue('Synced from device A');

  // Device B scores a criterion; device A picks it up.
  await pageB.locator('.panel-tab', { hasText: 'Score' }).click();
  await pageB.locator('.criterion').first().locator('.score-btn', { hasText: '3' }).click();
  await pageA.locator('.panel-tab', { hasText: 'Score' }).click();
  await expect(pageA.locator('.criterion').first().locator('.score-btn.is-on')).toHaveText('3', { timeout: 20_000 });

  await a.close();
  await b.close();
});

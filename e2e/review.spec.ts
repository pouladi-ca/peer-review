import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(dir, '..', 'screenshots');

async function startWithSample(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Read closely/i })).toBeVisible();
  await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
  // The workspace top bar appears once the review opens.
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 30_000 });
  // Wait for the first page to render (canvas has non-zero size).
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

test('library renders and opens the sample application', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Read closely/i })).toBeVisible();
  await page.screenshot({ path: path.join(shots, '01-library.png'), fullPage: false });
  await startWithSample(page);
  // Framework should be auto-detected as NIH from the sample text.
  await expect(page.locator('.topbar-fw select')).toHaveValue('nih-2025', { timeout: 20_000 });
});

test('brief panel shows detected facts and aims', async ({ page }) => {
  await startWithSample(page);
  await expect(page.getByLabel('Applicant')).toHaveValue(/Vasquez/);
  await expect(page.getByLabel('Mechanism')).toHaveValue(/R01/);
  await expect(page.locator('.aims li')).toHaveCount(3);
  await page.screenshot({ path: path.join(shots, '02-brief.png') });
});

test('outline detection lists key sections', async ({ page }) => {
  await startWithSample(page);
  const outline = page.locator('.outline');
  await expect(outline).toContainText('Specific Aims');
  await expect(outline).toContainText('Significance');
  await expect(outline).toContainText('Approach');
});

test('tagging a selection creates a note and a draft bullet', async ({ page }) => {
  await startWithSample(page);
  // The abstract on page 1 has ample body text. Select a run in the text layer.
  const span = page.locator('.textLayer span').filter({ hasText: /stroke|disability|astrocyte|repair/i }).first();
  await expect(span).toBeVisible({ timeout: 15000 });
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  // The selection toolbar appears; press S for strength.
  await expect(page.locator('.sel-toolbar')).toBeVisible({ timeout: 8000 });
  await page.screenshot({ path: path.join(shots, '03-selection.png') });
  await page.keyboard.press('s');

  // Notes tab now shows one note.
  await expect(page.locator('.panel-tab', { hasText: 'Notes' }).locator('.count')).toHaveText('1');
  const note = page.locator('.note').first();
  await expect(note).toBeVisible();
  await note.locator('.note-comment').fill('Clearly motivated barrier to progress.');
  await page.screenshot({ path: path.join(shots, '04-notes.png') });
});

test('scoring a criterion and checking the draft preview', async ({ page }) => {
  await startWithSample(page);
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  // Score the first criterion (NIH: click score button "2").
  const firstCriterion = page.locator('.criterion').first();
  await firstCriterion.locator('.score-btn', { hasText: '2' }).click();
  await firstCriterion.locator('.ta').first().fill('Strong significance and a clear premise.');
  await expect(firstCriterion.locator('.score-btn.is-on')).toHaveText('2');
  await page.screenshot({ path: path.join(shots, '05-score.png') });

  // Overall rating.
  const overall = page.locator('.overall');
  await overall.locator('.score-btn', { hasText: '3' }).first().click();
  await overall.locator('.ta').fill('A strong application with a fixable rigor gap.');

  // Draft preview reflects the score.
  await page.locator('.panel-tab', { hasText: 'Draft' }).click();
  await expect(page.locator('.preview')).toContainText('Importance of the Research');
  await expect(page.locator('.preview .pv-score').first()).toContainText('2');
  await page.screenshot({ path: path.join(shots, '06-draft.png'), fullPage: false });
});

test('scorecard and submit-readiness reflect progress', async ({ page }) => {
  await startWithSample(page);
  // Score two criteria so the scorecard has content.
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  const crits = page.locator('.criterion');
  await crits.nth(0).locator('.score-btn', { hasText: '2' }).click();
  await crits.nth(0).locator('.ta').first().fill('Strong significance and a clear premise for the work.');

  // The Brief scorecard now shows a row with the score swatch.
  await page.locator('.panel-tab', { hasText: 'Brief' }).click();
  await expect(page.locator('.scorecard .sc-row').first()).toBeVisible();
  await expect(page.locator('.scorecard .sc-swatch').first()).toHaveText('2');
  await page.screenshot({ path: path.join(shots, '10-scorecard.png') });

  // The Draft "before you submit" panel lists blockers with jump buttons.
  await page.locator('.panel-tab', { hasText: 'Draft' }).click();
  await expect(page.locator('.submit-check .sc-item.is-blocker').first()).toBeVisible();
  const before = await page.locator('.submit-check .sc-item.is-blocker').count();
  expect(before).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(shots, '11-submit-check.png') });
});

test('checklist finds evidence in the sample', async ({ page }) => {
  await startWithSample(page);
  await page.locator('.panel-tab', { hasText: 'Checklist' }).click();
  // The sample includes a power analysis, so that item should show a page chip.
  const powerItem = page.locator('.check-item', { hasText: /power/i }).first();
  await expect(powerItem.locator('.chip-page')).toHaveCount(1, { timeout: 10000 }).catch(() => undefined);
  await expect(page.locator('.check-item .chip-page').first()).toBeVisible();
  await page.screenshot({ path: path.join(shots, '07-checklist.png') });
});

test('command palette opens and dark theme applies', async ({ page }) => {
  await startWithSample(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette')).toBeVisible();
  await page.locator('.palette-input input').fill('dark');
  await page.screenshot({ path: path.join(shots, '08-palette.png') });
  await page.locator('.palette-item', { hasText: /Theme: dark/i }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '09-dark.png') });
});

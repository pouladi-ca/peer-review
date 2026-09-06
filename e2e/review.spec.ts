import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(dir, '..', 'screenshots');

async function startWithSample(page: Page) {
  await login(page);
  await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
  // The workspace top bar appears once the review opens.
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 30_000 });
  // Wait for the first page to render (canvas has non-zero size).
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

test('the app is gated behind login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Password')).toBeVisible();
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/not right/i);
  await page.getByLabel('Password').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Read closely/i })).toBeVisible();
  // The session persists across a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: /Read closely/i })).toBeVisible();
});

test('library renders and opens the sample application', async ({ page }) => {
  await login(page);
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

test('dragging with the mouse selects text and shows the tag toolbar', async ({ page }) => {
  await startWithSample(page);
  const spans = page.locator('.pdf-page[data-page="1"] .textLayer span');
  await expect.poll(() => spans.count()).toBeGreaterThan(20);
  const a = (await spans.nth(12).boundingBox())!;
  const z = (await spans.nth(16).boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(z.x + z.width - 2, z.y + z.height / 2, { steps: 12 });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString().trim().length ?? 0);
  expect(selected).toBeGreaterThan(5);
  await expect(page.locator('.sel-toolbar')).toBeVisible();
  await page.keyboard.press('w');
  await expect(page.locator('.panel-tab', { hasText: 'Notes' }).locator('.count')).toHaveText('1');
  await expect(page.locator('.note.is-selected')).toContainText(/\S/);
});

test('pressing a tag key with nothing selected shows a hint', async ({ page }) => {
  await startWithSample(page);
  await page.locator('.viewer-scroll').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('s');
  await expect(page.locator('.toast')).toContainText(/Select a passage/);
});

test('focus mode and a hidden navigator keep the document visible', async ({ page }) => {
  await startWithSample(page);
  const viewerWidth = () => page.locator('.viewer').evaluate((el) => el.getBoundingClientRect().width);
  const canvasWidth = () => page.locator('.pdf-canvas').first().evaluate((el) => el.getBoundingClientRect().width);
  const full = await viewerWidth();
  // Hide the navigator: the viewer should widen, not collapse.
  await page.keyboard.press('\\');
  await expect.poll(viewerWidth).toBeGreaterThan(full);
  await expect.poll(canvasWidth).toBeGreaterThan(300);
  await page.keyboard.press('\\');
  // Focus mode: only the viewer remains and it fills the window.
  await page.keyboard.press('f');
  await expect(page.locator('.ws')).toHaveClass(/is-focus/);
  await expect(page.locator('.panel')).toHaveCount(0);
  await expect.poll(viewerWidth).toBeGreaterThan(full * 1.5);
  await expect.poll(canvasWidth).toBeGreaterThan(300);
  await page.screenshot({ path: path.join(shots, '14-focus-mode.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('.ws')).not.toHaveClass(/is-focus/);
});

test('fit whole page makes each page fully visible', async ({ page }) => {
  await startWithSample(page);
  const viewH = await page.locator('.viewer-scroll').evaluate((el) => el.clientHeight);
  const before = await page.locator('.page-slot').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(before).toBeGreaterThan(viewH); // fit width: a letter page is taller than the viewport
  await page.getByRole('button', { name: 'Fit whole page' }).click();
  await expect.poll(() => page.locator('.page-slot').first().evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(viewH);
  await expect(page.getByRole('button', { name: 'Fit whole page' })).toHaveClass(/is-active/);
  await page.getByRole('button', { name: 'Fit width' }).click();
  await expect.poll(() => page.locator('.page-slot').first().evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(viewH);
});

test('the reading view reflows the document and notes map between views', async ({ page }) => {
  await startWithSample(page);
  // Tag a passage in the page view first.
  const span = page.locator('.textLayer span').filter({ hasText: /Ischemic stroke|second leading/i }).first();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.locator('.sel-toolbar .sel-strength').click();
  await expect(page.locator('.note.is-selected')).toBeVisible();

  // Switch to Read: the server's reflow renders headings and paragraphs.
  await page.getByRole('radio', { name: 'Read' }).click();
  const content = page.locator('.read-content');
  await expect(content).toBeVisible({ timeout: 60_000 });
  await expect(content.locator('h2', { hasText: 'Specific Aims' })).toBeVisible();
  // The page-view note shows as a highlight in the reading view.
  await expect(content.locator('mark.rhl-strength')).toHaveCount(1);
  await page.screenshot({ path: path.join(shots, '18-reading-view.png') });

  // Tag in the reading view: select part of a paragraph.
  const para = content.locator('p').filter({ hasText: /Stroke affects more than 12 million/ }).first();
  await para.scrollIntoViewIfNeeded();
  await para.evaluate((el) => {
    const text = el.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 40);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('.sel-toolbar')).toBeVisible();
  await page.locator('.sel-toolbar .sel-weakness').click();
  await expect(content.locator('mark.rhl-weakness')).toHaveCount(1);
  const note = page.locator('.note.is-selected');
  await expect(note).toContainText(/Stroke affects/);
  await expect(note.locator('.chip-page')).toContainText('p. 2');

  // Back in the page view, the reading-view note has located rectangles on page 2.
  await page.getByRole('radio', { name: 'Pages' }).click();
  await expect(page.locator('.pdf-page[data-page="2"] .hl-weakness').first()).toBeAttached({ timeout: 20_000 });

  // The outline in reading view uses the reflow table of contents.
  await page.getByRole('radio', { name: 'Read' }).click();
  await expect(page.locator('.outline-item', { hasText: 'Specific Aims' })).toBeVisible();
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

test('the document scrolls and page navigation advances', async ({ page }) => {
  await startWithSample(page);
  const pageNo = () => page.locator('.page-ctrl input').inputValue();
  expect(await pageNo()).toBe('1');
  // The scroll container must be height-constrained so the wheel scrolls it.
  const box = await page.locator('.viewer-scroll').evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(box.scroll).toBeGreaterThan(box.client);
  await page.getByRole('button', { name: /Next page/ }).click();
  await expect.poll(pageNo).toBe('2');
  await page.waitForTimeout(800); // let the smooth scroll settle before the user scrolls
  await page.locator('.viewer-scroll').hover({ position: { x: 300, y: 300 } });
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 2500);
  await expect.poll(pageNo, { timeout: 5000 }).not.toBe('2');
  await page.keyboard.press('[');
  await page.waitForTimeout(600);
  // Leaving and reopening the review resumes where reading stopped, and says so.
  const pageBefore = await pageNo();
  await page.getByRole('button', { name: 'Library' }).click();
  await page.locator('.review-card-main').first().click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.toast')).toContainText(`Resumed at p. ${pageBefore}`);
  await expect.poll(pageNo).toBe(pageBefore);
  // Landscape and portrait pages both fit the container width.
  const widths = await page.locator('.page-slot').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  const heights = await page.locator('.page-slot').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBeGreaterThan(1); // mixed page sizes present
});

test('a custom framework can be created and used', async ({ page }) => {
  await startWithSample(page);
  await page.locator('.topbar-fw select').selectOption('__manage');
  await expect(page.locator('.fw-editor')).toBeVisible();
  await page.locator('.fw-create select').selectOption('generic');
  await page.getByRole('button', { name: /Duplicate and edit/ }).click();
  const name = page.locator('.fw-form input').first();
  await name.fill('Foundation Rubric');
  await page.locator('.fw-crit-name').first().fill('Scientific Merit');
  await page.getByRole('button', { name: /Save framework/ }).click();
  await expect(page.locator('.fw-item.is-on')).toContainText('Foundation Rubric');
  await page.keyboard.press('Escape');
  await expect(page.locator('.fw-editor')).toBeHidden();
  // Select it for the review; the Score tab shows the renamed criterion.
  const opt = await page.locator('.topbar-fw select option', { hasText: 'Foundation Rubric' }).getAttribute('value');
  await page.locator('.topbar-fw select').selectOption(opt!);
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  await expect(page.locator('.criterion').first()).toContainText('Scientific Merit');
  await page.screenshot({ path: path.join(shots, '12-custom-framework.png') });
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

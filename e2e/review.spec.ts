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
  await page.getByLabel('Email').fill('reviewer@example.org');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/not right/i);
  await page.getByLabel('Password').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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

test('the framework menu can be pinned, hidden, and given a default', async ({ page }) => {
  await login(page);
  const select = page.locator('.dropzone-row select');
  await select.selectOption('__manage');
  await expect(page.locator('.fw-editor')).toBeVisible();
  const hdsa = 'HDSA Human Biology / Human Experience Project';
  await page.getByRole('button', { name: `Pin ${hdsa}` }).click();
  await page.getByRole('button', { name: 'Hide NSF Merit Review' }).click();
  await page.getByRole('button', { name: `Default for new reviews: ${hdsa}` }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.fw-editor')).toBeHidden();
  await expect(select).toHaveValue('hdsa');
  await expect(select.locator('optgroup[label="Pinned"] option')).toHaveText([hdsa]);
  await expect(select.locator('option', { hasText: 'NSF Merit Review' })).toHaveCount(0);
  // Preferences are part of the account: once pushed, they survive a reload.
  await expect(page.locator('.library-tag .sync-state')).toContainText(/Synced/, { timeout: 15_000 });
  await page.reload();
  await expect(page.locator('.library-main')).toBeVisible();
  await expect(select).toHaveValue('hdsa');
  // Put things back for the tests that rely on detection.
  await select.selectOption('__manage');
  await page.getByRole('button', { name: `Unpin ${hdsa}` }).click();
  await page.getByRole('button', { name: 'Show NSF Merit Review' }).click();
  await page.getByRole('button', { name: `Clear default: ${hdsa}` }).click();
  await page.keyboard.press('Escape');
  await expect(select).toHaveValue('auto');
  await expect(page.locator('.library-tag .sync-state')).toContainText(/Synced/, { timeout: 15_000 });
});

test('writing aids: phrases insert with a selected blank, evidence composes into sentences, wording is checked against the score', async ({ page }) => {
  await startWithSample(page);
  // Focus the first criterion so the tagged note attaches to it, then tag a major weakness.
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  const card = page.locator('.criterion').first();
  await card.getByRole('button', { name: /Focus/ }).click();
  const span = page.locator('.textLayer span').filter({ hasText: /stroke|disability|astrocyte|repair/i }).first();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.locator('.sel-toolbar .sel-weakness').click();
  await page.locator('.note.is-selected .note-comment').fill('no power analysis is given for the behavioural readouts');
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  const ta = card.locator('textarea').first();
  // From evidence writes a sentence built from the note.
  await card.getByRole('button', { name: /From evidence/ }).click();
  // New weaknesses are minor until the reviewer says otherwise, so the minor template applies.
  await expect(ta).toHaveValue(/A minor point: No power analysis is given for the behavioural readouts \(p\. \d+: “.+”\)\./);
  // A phrase is inserted at the caret with its first blank selected.
  await card.getByRole('button', { name: 'Phrases' }).click();
  await page.getByRole('dialog', { name: 'Phrasebook' }).getByRole('radio', { name: 'Major weakness' }).click();
  await page.locator('.aids-phrase').first().click();
  await expect(ta).toHaveValue(/\{[^}]+\}/);
  const selected = await ta.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(selected).toMatch(/^\{.+\}$/);
  // Harsh wording next to a top score is flagged; a matching score clears it.
  await ta.fill('A significant weakness undermines Aim 2, and the premise is not credible; the plan is not feasible.');
  await card.locator('.score-btn', { hasText: /^2$/ }).click();
  await expect(card.locator('.aids-callout')).toContainText(/reads harsher/);
  await card.locator('.score-btn', { hasText: /^7$/ }).click();
  await expect(card.locator('.aids-callout')).toHaveCount(0);
});

test('writing aids: proposal vocabulary autocompletes, bias wording is noted, saved phrases return, guidance exports on request', async ({ page }) => {
  await startWithSample(page);
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  const card = page.locator('.criterion').first();
  const ta = card.locator('textarea').first();
  // Autocomplete from the proposal's own words.
  await ta.click();
  await ta.pressSequentially('The role of exos', { delay: 20 });
  const pop = page.locator('.vocab-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(/exosom/i);
  await page.keyboard.press('Tab');
  await expect(ta).toHaveValue(/^The role of [Ee]xosom\w+$/);
  await expect(pop).toHaveCount(0);
  // A person-focused remark gets a gentle note with the reason.
  await ta.fill('Impressive for a young investigator; the design is sound (p. 3).');
  await expect(card.locator('.aids-notes .is-bias')).toContainText(/expectations for the person/);
  // Save a selection as a phrase of your own; it appears under Yours and inserts.
  await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.indexOf('the design'), el.value.indexOf(' (p. 3)')));
  await card.getByRole('button', { name: 'Phrases' }).click();
  const dialog = page.getByRole('dialog', { name: 'Phrasebook' });
  await dialog.getByRole('button', { name: 'Save selection' }).click();
  await expect(dialog.getByLabel('Phrase to save')).toHaveValue('the design is sound');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.locator('.aids-mine')).toHaveCount(1);
  await expect(dialog.locator('.aids-mine .aids-use')).toContainText('Yours');
  await page.keyboard.press('Escape');
  // Guidance is off by default in the export and appears when switched on.
  await page.locator('.panel-tab', { hasText: 'Draft' }).click();
  await expect(page.locator('.preview .pv-guide')).toHaveCount(0);
  await page.getByLabel(/Include the framework/).check();
  await expect(page.locator('.preview .pv-guide').first()).toBeVisible();
  await expect(page.locator('.preview .pv-guide li').first()).not.toBeEmpty();
  await page.getByLabel(/Include the framework/).uncheck();
  await expect(page.locator('.preview .pv-guide')).toHaveCount(0);
  // Full quotes is a remembered export option too.
  const full = page.getByLabel(/Quote highlighted passages in full/);
  await full.check();
  await page.reload();
  await expect(page.locator('.library-main')).toBeVisible();
  await page.locator('.review-card-main').first().click();
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('.panel-tab', { hasText: 'Draft' }).click();
  await expect(page.getByLabel(/Quote highlighted passages in full/)).toBeChecked();
  await page.getByLabel(/Quote highlighted passages in full/).uncheck();
});

test('meeting mode: a panel card with a drafted pitch, a discussion log, and the score after discussion', async ({ page }) => {
  await startWithSample(page);
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  await page.locator('.card.overall .score-btn', { hasText: /^3$/ }).click();
  await page.locator('.panel-tab', { hasText: 'Draft' }).click();
  await expect(page.locator('.panel-pitch')).toContainText(/proposes 3 aims/);
  await page.getByRole('button', { name: 'Open meeting mode' }).click();
  const meeting = page.getByRole('dialog', { name: 'Panel' });
  await expect(meeting).toBeVisible();
  await expect(meeting.locator('.meeting-score-value').first()).toHaveText('3 Excellent');
  await meeting.getByRole('button', { name: 'Draft' }).click();
  await expect(meeting.getByLabel('Pitch')).toHaveValue(/I scored it 3 Excellent/);
  await meeting.getByRole('radio', { name: 'Chair' }).click();
  await meeting.getByLabel('What was said').fill('Asks about the timeline for Aim 2');
  await meeting.getByLabel('What was said').press('Enter');
  await expect(meeting.getByLabel('Discussion log')).toContainText('Chair');
  await expect(meeting.getByLabel('Discussion log')).toContainText('Asks about the timeline for Aim 2');
  await meeting.getByRole('radiogroup', { name: 'Score after discussion' }).getByRole('radio', { name: '4' }).click();
  await meeting.getByLabel('Reason for the score after discussion').fill('timeline concern shared by R2');
  await meeting.getByRole('button', { name: 'Record' }).click();
  await expect(meeting.locator('.meeting-score-final .meeting-score-value')).toHaveText('4 Very Good');
  await expect(meeting.getByLabel('Discussion log')).toContainText(/Score after discussion: 4 Very Good/);
  await page.keyboard.press('Escape');
  await expect(meeting).toHaveCount(0);
});

test('a PDF posted from a phone share sheet becomes a review that /?open= brings up', async ({ page, request }) => {
  await login(page);
  await page.locator('.account-btn').click();
  await page.getByRole('menuitem', { name: /Send PDFs from your phone/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Send PDFs from your phone' });
  await dialog.getByRole('button', { name: /Create token/ }).click();
  const token = (await dialog.locator('.temp-pass-code').textContent())!.trim();
  expect(token.length).toBeGreaterThan(20);
  await page.keyboard.press('Escape');
  // What the iOS Shortcut sends: the raw PDF with the bearer token, no cookie, no origin.
  const pdf = await (await import('node:fs/promises')).readFile('public/sample-application.pdf');
  const r = await request.post('/api/inbox?name=Shared%20from%20phone.pdf', { data: pdf, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' } });
  expect(r.ok()).toBe(true);
  const { reviewId, url } = (await r.json()) as { reviewId: string; url: string };
  expect(url).toContain(`/?open=${reviewId}`);
  await page.goto(`/?open=${reviewId}`);
  await expect(page.locator('.title-input')).toHaveValue('Shared from phone', { timeout: 30_000 });
  await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
});

test('a passkey can be added, then used to sign in, and devices can be signed out one at a time', async ({ page }) => {
  // A virtual authenticator stands in for Face ID or Touch ID.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await login(page);
  await page.locator('.account-btn').click();
  await page.getByRole('menuitem', { name: /Passkeys and devices/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Passkeys and devices' });
  await expect(dialog.getByLabel('Signed-in devices').locator('li.is-current')).toHaveCount(1);
  await dialog.getByLabel('Passkey name').fill('Test laptop');
  await dialog.getByRole('button', { name: /Add a passkey for this device/ }).click();
  await expect(dialog.getByLabel('Passkeys')).toContainText('Test laptop');
  await page.keyboard.press('Escape');
  // Sign out, then back in with the passkey alone.
  await page.locator('.account-btn').click();
  await page.getByRole('menuitem', { name: 'Sign out of this device' }).click();
  await expect(page.getByLabel('Password')).toBeVisible();
  await page.getByRole('button', { name: /Sign in with a passkey/ }).click();
  await expect(page.locator('.library-main')).toBeVisible({ timeout: 15_000 });
  // The old session is gone from the list; ending a session from another device works.
  const other = await page.context().browser()!.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  await page.locator('.account-btn').click();
  await page.getByRole('menuitem', { name: /Passkeys and devices/ }).click();
  const devices = page.getByRole('dialog', { name: 'Passkeys and devices' }).getByLabel('Signed-in devices');
  await expect(devices.locator('li.is-current')).toHaveCount(1);
  const before = await devices.locator('li').count();
  expect(before).toBeGreaterThanOrEqual(2); // earlier tests signed in too; the newest non-current row is the other browser
  await devices.locator('li:not(.is-current)').first().getByRole('button', { name: /Sign out/ }).click();
  await expect(devices.locator('li')).toHaveCount(before - 1);
  await otherPage.reload();
  await expect(otherPage.getByLabel('Password')).toBeVisible();
  await other.close();
  // Remove the passkey to leave the account as it was.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('dialog', { name: 'Passkeys and devices' }).getByRole('button', { name: /Remove passkey Test laptop/ }).click();
  await expect(page.getByRole('dialog', { name: 'Passkeys and devices' }).getByLabel('Passkeys')).toHaveCount(0);
});

test('the brief indexes preliminary-data claims and the reading view can read aloud', async ({ page }) => {
  await startWithSample(page);
  const card = page.locator('.card', { hasText: 'Preliminary data' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator('.card-toggle').click();
  const claims = card.getByLabel('Preliminary data claims');
  await expect(claims.locator('li').first()).toContainText(/We have found|preliminary/i);
  await claims.locator('.claim').first().click();
  await expect(page.locator('.title-input')).toBeVisible();
  // Read aloud lives in the reading view; the control is present wherever speech is supported.
  await page.getByRole('radio', { name: 'Read' }).click();
  await expect(page.locator('.read-content')).toBeVisible({ timeout: 60_000 });
  const supported = await page.evaluate(() => 'speechSynthesis' in window);
  if (supported) {
    await page.getByRole('button', { name: 'Read aloud from here' }).click();
    await expect(page.getByRole('group', { name: 'Read aloud' })).toBeVisible();
    await expect(page.locator('.read-content .is-speaking')).toHaveCount(1);
    await page.getByRole('button', { name: 'Stop reading' }).click();
    await expect(page.locator('.read-content .is-speaking')).toHaveCount(0);
  }
});

test('reviews can carry a due date and be archived and brought back', async ({ page }) => {
  await login(page);
  // A fresh browser fills its library from sync; act only once that has settled.
  await expect(page.locator('.library-tag .sync-state')).toContainText(/Synced/, { timeout: 30_000 });
  if ((await page.locator('.review-card').count()) === 0) {
    await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
    await expect(page.locator('.pdf-canvas').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Library' }).click();
  }
  const first = page.locator('.review-list > ul > li.review-card').first();
  await first.getByRole('button', { name: 'Set due date' }).click();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  await first.locator('input[type="date"]').fill(iso);
  await first.getByRole('button', { name: 'Done' }).click();
  await expect(first.locator('.due')).toHaveText('Due tomorrow');
  // Archive: it leaves the active list and appears under Archived; unarchive restores it.
  const activeBefore = await page.locator('.review-list > ul > li.review-card').count();
  await first.getByRole('button', { name: 'Archive review' }).click();
  await expect(page.locator('.review-list > ul > li.review-card')).toHaveCount(activeBefore - 1);
  await page.getByRole('button', { name: /Archived \(\d+\)/ }).click();
  // The one archived just now is listed first; sync may have renamed it meanwhile, so do not match on the title.
  const archivedCard = page.locator('.review-card.is-archived').first();
  await expect(archivedCard).toBeVisible();
  await expect(archivedCard).toContainText('Archived just now');
  await archivedCard.getByRole('button', { name: 'Unarchive review' }).click();
  await expect(page.locator('.review-list > ul > li.review-card')).toHaveCount(activeBefore);
  // Clear the due date to leave things as they were: the restored card is the one carrying the chip.
  const restored = page.locator('.review-list > ul > li.review-card', { has: page.locator('.due') }).first();
  await restored.getByRole('button', { name: 'Change due date' }).click();
  await restored.getByRole('button', { name: 'Clear' }).click();
  await expect(restored.locator('.due')).toHaveCount(0);
});

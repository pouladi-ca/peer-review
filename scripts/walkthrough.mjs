/**
 * Drives Panelist through a complete, realistic grant review and captures a
 * numbered screenshot walkthrough into screenshots/walkthrough/.
 *
 * Run against a preview server on port 4319:
 *   npm run build && npm run preview -- --port 4319 --strictPort &
 *   node scripts/walkthrough.mjs
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
const LINUX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', 'screenshots', 'walkthrough');
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:4319';

let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = path.join(out, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('captured', path.basename(file));
};

const KIND = { s: 'strength', w: 'weakness', q: 'question', n: 'note' };

/** Select a text-layer span whose text matches, then tag it via the toolbar button. */
async function tag(page, pattern, key, comment, criterion) {
  // Blur any focused textarea so the selection flow is not treated as typing.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const span = page.locator('.textLayer span').filter({ hasText: pattern }).first();
  await span.waitFor({ state: 'visible', timeout: 10000 });
  await span.scrollIntoViewIfNeeded();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.locator('.sel-toolbar').waitFor({ state: 'visible', timeout: 6000 });
  await page.locator(`.sel-toolbar .sel-${KIND[key]}`).click();
  // The app selects the new note and switches to the Notes tab; target it.
  const note = page.locator('.note.is-selected').first();
  await note.waitFor({ state: 'visible', timeout: 6000 });
  await note.locator('.note-comment').fill(comment);
  if (criterion) {
    await note.locator('.note-foot select').selectOption({ label: criterion }).catch(() => {});
  }
  await note.locator('.note-comment').evaluate((el) => el.blur());
  await page.waitForTimeout(150);
}

async function jumpTo(page, section) {
  await page.locator('.nav-tabs button', { hasText: 'Outline' }).click();
  await page.locator('.outline-item', { hasText: section }).first().click();
  await page.waitForTimeout(900);
}

const run = async () => {
  const browser = await chromium.launch(fs.existsSync(LINUX_CHROME) ? { executablePath: LINUX_CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  // 1. Library
  await page.goto(BASE);
  await page.getByRole('heading', { name: /Read closely/i }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, 'library');

  // Open the sample.
  await page.getByRole('button', { name: 'Try a sample application', exact: true }).click();
  await page.locator('.pdf-canvas').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 2. Brief on open
  await shot(page, 'brief-open');

  // 3. Tag a strength in the abstract (page 1), showing the selection toolbar.
  const span = page.locator('.textLayer span').filter({ hasText: /stroke|astrocyte|repair/i }).first();
  await span.waitFor({ state: 'visible' });
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.locator('.sel-toolbar').waitFor({ state: 'visible' });
  await shot(page, 'selection-toolbar');
  await page.locator('.sel-toolbar .sel-strength').click();
  const firstNote = page.locator('.note.is-selected').first();
  await firstNote.waitFor({ state: 'visible', timeout: 6000 });
  await firstNote.locator('.note-comment').fill('Addresses a genuine barrier: no approved therapy promotes repair after the acute window.');
  await firstNote.locator('.note-foot select').selectOption({ label: 'Importance' }).catch(() => {});
  await firstNote.locator('.note-comment').evaluate((el) => el.blur());

  // Tag more passages across the application to build a real review.
  await jumpTo(page, 'Significance');
  await tag(page, /barrier|unmet|approved|paradigm/i, 's', 'Strong, well-motivated premise grounded in the RhoA/ROCK literature.', 'Importance');

  await jumpTo(page, 'Approach');
  await tag(page, /power analysis|80% power|sample size|randomi/i, 's', 'Rigor is addressed directly: power analysis, randomisation, and blinding are all specified.', 'Rigor & Feasibility');
  await tag(page, /pitfalls|alternative|contingenc/i, 'q', 'What is the decision rule for switching to the Nrf2 alternative if Aim 1 is negative?', 'Rigor & Feasibility');

  await jumpTo(page, 'Investigators');
  await tag(page, /statistic|biostatistician|expertise|track record/i, 's', 'Team covers the needed skills, including a biostatistician for the mixed-effects analysis.', 'Expertise & Resources');

  // 4. Notes tab, populated
  await page.locator('.panel-tab', { hasText: 'Notes' }).click();
  await page.waitForTimeout(300);
  await shot(page, 'notes');

  // 5. Score every core criterion with rationale.
  await page.locator('.panel-tab', { hasText: 'Score' }).click();
  const crits = page.locator('.criterion');
  const scoreCrit = async (i, btn, rationale) => {
    const c = crits.nth(i);
    await c.locator('.score-btn, .score-cat-btn').filter({ hasText: btn }).first().click().catch(() => {});
    await c.locator('.ta').first().fill(rationale);
  };
  await scoreCrit(0, '2', 'Significance is high: the work targets an unmet need with a clear, well-supported premise.');
  await scoreCrit(1, '3', 'Approach is rigorous and feasible; the only reservation is the dependency between Aims 1 and 2.');
  // Factor 3 is categorical for NIH 2025.
  await crits.nth(2).locator('.score-cat-btn', { hasText: /appropriate/i }).first().click().catch(() => {});
  await crits.nth(2).locator('.ta').first().fill('The team and environment are well matched to the proposed work.');
  await page.waitForTimeout(300);
  await shot(page, 'score');

  // Overall
  const overall = page.locator('.overall');
  await overall.locator('.score-btn', { hasText: '3' }).first().click().catch(() => {});
  await overall.locator('.ta').fill('A strong, well-designed application. Significance and rigor are high; the interdependence of the aims is the main risk and is partly mitigated by the stated alternatives.');
  await page.waitForTimeout(300);

  // 6. Brief scorecard
  await page.locator('.panel-tab', { hasText: 'Brief' }).click();
  await page.waitForTimeout(300);
  await shot(page, 'scorecard');

  // 7. Checklist with evidence
  await page.locator('.panel-tab', { hasText: 'Checklist' }).click();
  await page.waitForTimeout(400);
  // Confirm a few reviewer self-checks.
  await page.locator('.check-item', { hasText: /conflict of interest/i }).locator('.tri-yes').click().catch(() => {});
  await page.locator('.check-item', { hasText: /entire application/i }).locator('.tri-yes').click().catch(() => {});
  await shot(page, 'checklist');

  // 8. Draft: summary + submit check
  await page.locator('.panel-tab', { hasText: 'Draft' }).click();
  await page.waitForTimeout(300);
  await page.locator('.card', { hasText: 'Summary of the application' }).locator('.link', { hasText: 'Prefill' }).click().catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, 'draft-submit-check');

  // 9. Draft preview (scroll to it)
  await page.locator('.preview').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, 'draft-preview');

  // 10. Command palette
  await page.keyboard.press('Control+k');
  await page.locator('.palette').waitFor({ state: 'visible' });
  await page.locator('.palette-input input').fill('export');
  await page.waitForTimeout(200);
  await shot(page, 'command-palette');
  await page.keyboard.press('Escape');

  // 11. Dark theme
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input input').fill('dark');
  await page.locator('.palette-item', { hasText: /Theme: dark/i }).first().click();
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.locator('.panel-tab', { hasText: 'Brief' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'dark-theme');

  // 12. Shortcuts help
  await page.keyboard.press('?');
  await page.locator('.help').waitFor({ state: 'visible' }).catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, 'shortcuts');

  await browser.close();
  console.log(`\nDone. ${n} screenshots in ${out}`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

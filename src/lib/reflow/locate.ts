/**
 * Locating a note's quoted text in either view.
 *
 * Notes made in the page view carry page rectangles; notes made in the reading view carry
 * a block anchor. Both carry the quote and the page, and both views derive their text from
 * the same PDF, so each can find a note made in the other by searching the page's text for
 * the quote (whitespace-insensitive, with a prefix fallback when the two extractors
 * disagree about a few characters).
 */
import type { PageText, Rect } from '../types';
import type { Block, ReadAnchor, ReflowDoc } from './types';

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Find `needle` in `hay` (both normalised), returning the character range in `hay`'s
 * *original* coordinates. Falls back to the longest prefix of the needle (at least 24
 * characters) so a quote that differs at its tail still locates.
 */
function findRange(hay: string, needle: string): { start: number; end: number } | null {
  // Map normalised positions back to original positions.
  const map: number[] = [];
  let out = '';
  let lastSpace = true;
  for (let i = 0; i < hay.length; i++) {
    const ch = hay[i];
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      out += ' ';
      map.push(i);
      lastSpace = true;
    } else {
      out += ch.toLowerCase();
      map.push(i);
      lastSpace = false;
    }
  }
  let n = norm(needle);
  if (!n) return null;
  for (let attempt = 0; attempt < 6 && n.length >= 24; attempt++) {
    const at = out.indexOf(n);
    if (at >= 0) return { start: map[at], end: map[at + n.length - 1] + 1 };
    n = n.slice(0, Math.max(24, Math.floor(n.length * 0.7))).trim();
  }
  const at = out.indexOf(n);
  return at >= 0 ? { start: map[at], end: map[at + n.length - 1] + 1 } : null;
}

/** Highlight rectangles for a quote on a page, spanning the runs it covers. */
export function rectsForQuote(page: PageText, quote: string): Rect[] {
  const range = findRange(page.text, quote);
  if (!range) return [];
  const rects: Rect[] = [];
  let pos = 0;
  for (const run of page.runs) {
    const runStart = pos;
    const runEnd = pos + run.str.length;
    pos = runEnd + 1; // runs are joined by exactly one separator in page.text
    if (runEnd <= range.start || runStart >= range.end) continue;
    const len = Math.max(run.str.length, 1);
    const s = Math.max(range.start, runStart) - runStart;
    const e = Math.min(range.end, runEnd) - runStart;
    rects.push({ x: run.x + run.w * (s / len), y: run.y, w: Math.max(run.w * ((e - s) / len), 0.004), h: run.h });
  }
  return rects;
}

/** A block anchor for a quote, searching the blocks of `page` first, then neighbours. */
export function anchorForQuote(doc: ReflowDoc, page: number, quote: string): ReadAnchor | null {
  const tryBlocks = (blocks: Block[]): ReadAnchor | null => {
    if (!blocks.length) return null;
    // Concatenate with single spaces so a quote can span block boundaries.
    const text = blocks.map((b) => b.text).join(' ');
    const range = findRange(text, quote);
    if (!range) return null;
    let offset = 0;
    let start: { block: string; off: number } | null = null;
    let end: { block: string; off: number } | null = null;
    for (const b of blocks) {
      const bStart = offset;
      const bEnd = offset + b.text.length;
      if (!start && range.start < bEnd) start = { block: b.id, off: Math.max(0, range.start - bStart) };
      if (range.end <= bEnd + 1) {
        end = { block: b.id, off: Math.min(b.text.length, range.end - bStart) };
        break;
      }
      offset = bEnd + 1;
    }
    if (!start || !end) return null;
    return { startBlock: start.block, startOff: start.off, endBlock: end.block, endOff: end.off };
  };
  const textual = doc.blocks.filter((b) => b.text);
  const onPage = textual.filter((b) => b.page === page);
  return tryBlocks(onPage) ?? tryBlocks(textual.filter((b) => Math.abs(b.page - page) <= 1)) ?? tryBlocks(textual);
}

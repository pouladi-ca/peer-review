import type { ChecklistItemDef } from '../frameworks';
import type { EvidenceHit, PageText, Rect } from '../types';

/** Locate the run containing a character offset of the page text, for a highlight rect. */
export function rectForOffset(page: PageText, offset: number, length: number): Rect | undefined {
  let pos = 0;
  for (const run of page.runs) {
    const end = pos + run.str.length;
    if (offset >= pos && offset < end) {
      const len = Math.max(run.str.length, 1);
      const startFrac = (offset - pos) / len;
      const wFrac = Math.min(length, run.str.length - (offset - pos)) / len;
      return { x: run.x + run.w * startFrac, y: run.y, w: Math.max(run.w * wFrac, 0.004), h: run.h };
    }
    pos = end + 1; // runs joined by a single separator in page.text
  }
  return undefined;
}

export function snippetAround(text: string, index: number, length: number, radius = 70): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) s = '…' + s;
  if (end < text.length) s = s + '…';
  return s;
}

/** Evidence for each checklist item: up to `limit` hits across all pages. */
export function findEvidence(items: ChecklistItemDef[], pages: PageText[], limit = 6): Record<string, EvidenceHit[]> {
  const result: Record<string, EvidenceHit[]> = {};
  for (const item of items) {
    const hits: EvidenceHit[] = [];
    if (!item.patterns) {
      result[item.id] = hits;
      continue;
    }
    outer: for (const page of pages) {
      const seenLines = new Set<number>();
      for (const rx of item.patterns) {
        const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
        for (const m of page.text.matchAll(g)) {
          const idx = m.index ?? 0;
          const lineKey = Math.floor(idx / 80);
          if (seenLines.has(lineKey)) continue;
          seenLines.add(lineKey);
          hits.push({ page: page.page, snippet: snippetAround(page.text, idx, m[0].length), rect: rectForOffset(page, idx, m[0].length) });
          if (hits.length >= limit) break outer;
        }
      }
    }
    result[item.id] = hits;
  }
  return result;
}

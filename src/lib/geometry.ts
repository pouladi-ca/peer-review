import type { Rect } from './types';

/** Merge rectangles that sit on the same line into single spans, and drop slivers. */
export function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].filter((r) => r.w > 0.001 && r.h > 0.001).sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last) {
      const overlap = Math.min(last.y + last.h, r.y + r.h) - Math.max(last.y, r.y);
      const sameLine = overlap > Math.min(last.h, r.h) * 0.5;
      if (sameLine && r.x <= last.x + last.w + 0.01) {
        const x = Math.min(last.x, r.x);
        const y = Math.min(last.y, r.y);
        last.w = Math.max(last.x + last.w, r.x + r.w) - x;
        last.h = Math.max(last.y + last.h, r.y + r.h) - y;
        last.x = x;
        last.y = y;
        continue;
      }
    }
    out.push({ ...r });
  }
  return out;
}

export function rectContains(r: Rect, x: number, y: number, pad = 0.002): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

export function unionRect(rects: Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/**
 * Turning notes into per-block highlight spans, and anchors back into quote text.
 * Ported from Marginalia and adapted to Panelist's note kinds.
 */
import type { NoteKind } from '../types';
import type { Block, ReadAnchor } from './types';
import type { HighlightSpan } from './segments';

export interface ResolvedNote {
  id: string;
  kind: NoteKind;
  hasComment: boolean;
  createdAt: number;
  anchor: ReadAnchor;
}

/** blockId → index in doc order. */
export function indexBlocks(blocks: Block[]): Map<string, number> {
  const map = new Map<string, number>();
  blocks.forEach((b, i) => map.set(b.id, i));
  return map;
}

/** Oldest first, so the newest highlight paints on top when they overlap. */
export function byAge(a: ResolvedNote, b: ResolvedNote): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Spread resolved notes across the blocks they cover, oldest first per block. */
export function spansByBlock(notes: ResolvedNote[], blocks: Block[]): Map<string, HighlightSpan[]> {
  const index = indexBlocks(blocks);
  const out = new Map<string, HighlightSpan[]>();
  const push = (blockId: string, span: HighlightSpan) => {
    const list = out.get(blockId);
    if (list) list.push(span);
    else out.set(blockId, [span]);
  };
  for (const n of [...notes].sort(byAge)) {
    let from = index.get(n.anchor.startBlock);
    let to = index.get(n.anchor.endBlock);
    if (from === undefined || to === undefined) continue;
    let startOff = n.anchor.startOff;
    let endOff = n.anchor.endOff;
    if (to < from) {
      [from, to] = [to, from];
      [startOff, endOff] = [endOff, startOff];
    }
    const base = { id: n.id, kind: n.kind, hasComment: n.hasComment };
    if (from === to) {
      const len = blocks[from].text.length;
      const s = Math.max(0, Math.min(startOff, len));
      const e = Math.max(0, Math.min(endOff, len));
      if (e > s) push(blocks[from].id, { ...base, start: s, end: e });
      continue;
    }
    for (let i = from; i <= to; i++) {
      const block = blocks[i];
      const len = block.text.length;
      if (len === 0) continue;
      const s = i === from ? Math.max(0, Math.min(startOff, len)) : 0;
      const e = i === to ? Math.max(0, Math.min(endOff, len)) : len;
      if (e > s) push(block.id, { ...base, start: s, end: e });
    }
  }
  return out;
}

/** The text an anchor covers, read from the model; blocks are joined with a space. */
export function quoteFor(blocks: Block[], anchor: ReadAnchor): string {
  const index = indexBlocks(blocks);
  let from = index.get(anchor.startBlock);
  let to = index.get(anchor.endBlock);
  if (from === undefined || to === undefined) return '';
  let startOff = anchor.startOff;
  let endOff = anchor.endOff;
  if (to < from) {
    [from, to] = [to, from];
    [startOff, endOff] = [endOff, startOff];
  }
  const parts: string[] = [];
  for (let i = from; i <= to; i++) {
    const text = blocks[i].text;
    if (!text) continue;
    const s = i === from ? Math.max(0, Math.min(startOff, text.length)) : 0;
    const e = i === to ? Math.max(0, Math.min(endOff, text.length)) : text.length;
    const piece = text.slice(s, e);
    if (piece) parts.push(piece);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pure text-segmentation used by the reader to paint highlights.
 *
 * A block's DOM text must be the straight concatenation of its runs, so highlight
 * rendering may only *split* runs — never add or drop characters. Given the runs of a
 * block and the highlight spans that cover it, `splitRuns` returns the minimal list of
 * segments such that each segment lies inside exactly one run and is either fully
 * covered by one highlight or not covered at all.
 */
import type { NoteKind } from '../types';
import type { Run } from './types';

/** A highlight's footprint inside a single block, in block-text character offsets. */
export interface HighlightSpan {
  id: string;
  /** inclusive */
  start: number;
  /** exclusive */
  end: number;
  kind: NoteKind;
  hasComment: boolean;
}

export interface Segment {
  text: string;
  /** inclusive offset in the block's text */
  start: number;
  /** exclusive offset in the block's text */
  end: number;
  /** the run this segment came from (style flags, figure reference) */
  run: Run;
  /** the highlight covering this segment, if any */
  mark: HighlightSpan | null;
}

/** Total character length of a run list. */
export function runsLength(runs: Run[]): number {
  let n = 0;
  for (const r of runs) n += r.t.length;
  return n;
}

/**
 * Clamp a span to a block of `length` characters. Returns null when nothing is left.
 */
export function clampSpan(span: HighlightSpan, length: number): HighlightSpan | null {
  const start = Math.max(0, Math.min(span.start, length));
  const end = Math.max(0, Math.min(span.end, length));
  if (end <= start) return null;
  if (start === span.start && end === span.end) return span;
  return { ...span, start, end };
}

/**
 * Split `runs` at every run edge and every highlight edge.
 *
 * Overlaps: the *last* span in `spans` that covers a segment wins, so callers must pass
 * spans oldest-first for the most recently created highlight to paint on top. That is
 * what `spansByBlock` produces — note that it is *not* the `seq` order annotations are
 * loaded in, which follows document position rather than age.
 */
export function splitRuns(runs: Run[], spans: HighlightSpan[] = []): Segment[] {
  const total = runsLength(runs);
  if (total === 0) return [];

  const usable: HighlightSpan[] = [];
  for (const s of spans) {
    const c = clampSpan(s, total);
    if (c) usable.push(c);
  }

  // Every boundary at which the styling can change.
  const cuts = new Set<number>([0, total]);
  let at = 0;
  for (const run of runs) {
    at += run.t.length;
    cuts.add(at);
  }
  for (const s of usable) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const edges = [...cuts].filter((n) => n >= 0 && n <= total).sort((a, b) => a - b);

  const out: Segment[] = [];
  let runIndex = 0;
  let runStart = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const end = edges[i + 1];
    if (end <= start) continue;
    // Advance to the run containing `start`.
    while (runIndex < runs.length - 1 && start >= runStart + runs[runIndex].t.length) {
      runStart += runs[runIndex].t.length;
      runIndex += 1;
    }
    const run = runs[runIndex];
    const text = run.t.slice(start - runStart, end - runStart);
    if (!text) continue;
    let mark: HighlightSpan | null = null;
    for (const s of usable) if (s.start <= start && s.end >= end) mark = s;
    out.push({ text, start, end, run, mark });
  }
  return out;
}

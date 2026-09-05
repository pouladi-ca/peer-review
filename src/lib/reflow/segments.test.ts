import { describe, expect, it } from 'vitest';
import { clampSpan, runsLength, splitRuns, type HighlightSpan } from './segments';
import type { Run } from './types';

const span = (start: number, end: number, id = 'a1', extra: Partial<HighlightSpan> = {}): HighlightSpan => ({
  id,
  start,
  end,
  kind: 'strength',
  hasComment: false,
  ...extra,
});

const runs: Run[] = [
  { t: 'Plain ' },
  { t: 'bold', b: true },
  { t: ' italic', i: true },
  { t: ' see ' },
  { t: 'Fig. 2', fig: 'f002' },
  { t: '.' },
];

const text = runs.map((r) => r.t).join('');

describe('splitRuns', () => {
  it('returns one segment per run when nothing is highlighted', () => {
    const segments = splitRuns(runs);
    expect(segments).toHaveLength(runs.length);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.every((s) => s.mark === null)).toBe(true);
  });

  it('never changes the text, only where it is cut', () => {
    const segments = splitRuns(runs, [span(3, 9)]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('splits a run at a highlight boundary and keeps the run styling', () => {
    // "Plain bold" -> highlight covers offsets 3..9, crossing into the bold run.
    const segments = splitRuns(runs, [span(3, 9)]);
    const covered = segments.filter((s) => s.mark);
    expect(covered.map((s) => s.text)).toEqual(['in ', 'bol']);
    expect(covered[1].run.b).toBe(true);
    expect(covered[0].run.b).toBeUndefined();
  });

  it('reports offsets in block-text coordinates', () => {
    const segments = splitRuns(runs, [span(6, 10)]);
    const marked = segments.filter((s) => s.mark);
    expect(marked[0].start).toBe(6);
    expect(marked[marked.length - 1].end).toBe(10);
    expect(text.slice(6, 10)).toBe(marked.map((s) => s.text).join(''));
  });

  it('carries the highlight id, colour and comment flag through', () => {
    const segments = splitRuns(runs, [
      span(0, 5, 'a_one', { kind: 'weakness', hasComment: true }),
    ]);
    expect(segments[0].mark?.id).toBe('a_one');
    expect(segments[0].mark?.kind).toBe('weakness');
    expect(segments[0].mark?.hasComment).toBe(true);
  });

  it('handles two disjoint highlights in the same block', () => {
    const segments = splitRuns(runs, [span(0, 5, 'a1'), span(11, 17, 'a2')]);
    const ids = segments.filter((s) => s.mark).map((s) => s.mark!.id);
    expect(new Set(ids)).toEqual(new Set(['a1', 'a2']));
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('lets the later highlight win where two overlap', () => {
    const segments = splitRuns(runs, [span(0, 10, 'older'), span(4, 8, 'newer')]);
    const at5 = segments.find((s) => s.start <= 5 && s.end > 5);
    expect(at5?.mark?.id).toBe('newer');
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('clamps spans that run past the end of the block', () => {
    const segments = splitRuns(runs, [span(text.length - 2, text.length + 50)]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    const marked = segments.filter((s) => s.mark);
    expect(marked.map((s) => s.text).join('')).toBe(text.slice(-2));
  });

  it('drops spans that cannot cover anything', () => {
    expect(clampSpan(span(5, 5), 10)).toBeNull();
    expect(clampSpan(span(20, 30), 10)).toBeNull();
    expect(splitRuns(runs, [span(5, 5)]).every((s) => s.mark === null)).toBe(true);
  });

  it('returns nothing for an empty block', () => {
    expect(splitRuns([])).toEqual([]);
    expect(splitRuns([{ t: '' }])).toEqual([]);
    expect(runsLength(runs)).toBe(text.length);
  });
});

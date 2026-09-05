import { describe, it, expect } from 'vitest';
import { anchorForQuote, rectsForQuote } from './locate';
import type { PageText } from '../types';
import type { ReflowDoc } from './types';

const page: PageText = {
  page: 3,
  width: 612,
  height: 792,
  text: 'Stroke affects more than 12 million people.\nWe propose three specific aims.',
  lines: [],
  runs: [
    { str: 'Stroke affects more', x: 0.1, y: 0.1, w: 0.3, h: 0.02, size: 10, line: 0 },
    { str: 'than 12 million people.', x: 0.41, y: 0.1, w: 0.3, h: 0.02, size: 10, line: 0 },
    { str: 'We propose three specific aims.', x: 0.1, y: 0.13, w: 0.5, h: 0.02, size: 10, line: 1 },
  ],
};

const doc: ReflowDoc = {
  version: 1,
  title: 't',
  pages: [3],
  blocks: [
    { id: 'h', type: 'heading', level: 1, page: 3, text: 'Specific Aims' },
    { id: 'p1', type: 'paragraph', page: 3, text: 'Stroke affects more than 12 million people. We propose three specific aims.' },
    { id: 'p2', type: 'paragraph', page: 4, text: 'Aim 1 tests the mechanism in neurons.' },
  ],
  figures: [],
  toc: [],
};

describe('rectsForQuote', () => {
  it('spans the runs a quote covers', () => {
    const rects = rectsForQuote(page, 'more than 12 million');
    expect(rects.length).toBe(2);
    expect(rects[0].x).toBeGreaterThan(0.1); // starts partway into the first run
    expect(rects[1].y).toBeCloseTo(0.1);
  });
  it('tolerates whitespace differences and a differing tail', () => {
    expect(rectsForQuote(page, 'We   propose three specific aims and more words that differ').length).toBe(1);
  });
  it('returns nothing when the quote is absent', () => {
    expect(rectsForQuote(page, 'entirely different text')).toEqual([]);
  });
});

describe('anchorForQuote', () => {
  it('anchors a quote inside one block', () => {
    expect(anchorForQuote(doc, 3, 'three specific aims')).toEqual({ startBlock: 'p1', startOff: 55, endBlock: 'p1', endOff: 74 });
  });
  it('anchors across block boundaries', () => {
    const a = anchorForQuote(doc, 3, 'Specific Aims Stroke affects');
    expect(a).toEqual({ startBlock: 'h', startOff: 0, endBlock: 'p1', endOff: 14 });
  });
  it('looks at neighbouring pages when the page is off by one', () => {
    expect(anchorForQuote(doc, 3, 'Aim 1 tests the mechanism')?.startBlock).toBe('p2');
  });
});

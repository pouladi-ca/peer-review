import { describe, it, expect } from 'vitest';
import { indexBlocks, quoteFor, spansByBlock, type ResolvedNote } from './anchors';
import type { Block } from './types';

const blocks: Block[] = [
  { id: 'b1', type: 'heading', level: 1, page: 1, text: 'Specific Aims' },
  { id: 'b2', type: 'paragraph', page: 1, text: 'Stroke affects many people. We propose three aims.' },
  { id: 'f1', type: 'figure', page: 1, text: '', figure: 'fig1' },
  { id: 'b3', type: 'paragraph', page: 2, text: 'Aim 1 tests the mechanism.' },
];

const note = (id: string, anchor: ResolvedNote['anchor'], createdAt = 1): ResolvedNote => ({ id, kind: 'strength', hasComment: false, createdAt, anchor });

describe('reflow anchors', () => {
  it('indexes blocks in order', () => {
    expect(indexBlocks(blocks).get('b3')).toBe(3);
  });

  it('yields one span for a single-block note', () => {
    const spans = spansByBlock([note('a', { startBlock: 'b2', startOff: 0, endOff: 6, endBlock: 'b2' })], blocks);
    expect(spans.get('b2')).toEqual([{ id: 'a', kind: 'strength', hasComment: false, start: 0, end: 6 }]);
  });

  it('spreads a cross-block note and skips the figure', () => {
    const spans = spansByBlock([note('a', { startBlock: 'b2', startOff: 30, endBlock: 'b3', endOff: 5 })], blocks);
    expect(spans.get('b2')?.[0]).toMatchObject({ start: 30, end: blocks[1].text.length });
    expect(spans.get('f1')).toBeUndefined();
    expect(spans.get('b3')?.[0]).toMatchObject({ start: 0, end: 5 });
  });

  it('orders overlapping spans oldest first so the newest paints on top', () => {
    const spans = spansByBlock([note('new', { startBlock: 'b2', startOff: 2, endBlock: 'b2', endOff: 8 }, 5), note('old', { startBlock: 'b2', startOff: 0, endBlock: 'b2', endOff: 10 }, 1)], blocks);
    expect(spans.get('b2')?.map((s) => s.id)).toEqual(['old', 'new']);
  });

  it('reads the quote from the model, joining blocks with a space', () => {
    expect(quoteFor(blocks, { startBlock: 'b2', startOff: 45, endBlock: 'b3', endOff: 5 })).toBe('aims. Aim 1');
  });

  it('ignores anchors to blocks that no longer exist', () => {
    expect(spansByBlock([note('x', { startBlock: 'gone', startOff: 0, endBlock: 'gone', endOff: 3 })], blocks).size).toBe(0);
  });
});

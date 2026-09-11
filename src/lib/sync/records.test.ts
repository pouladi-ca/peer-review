import { describe, it, expect } from 'vitest';
import type { Review } from '../types';
import { produce } from 'immer';
import { applyRecord, diffRecords, reviewToRecords, shouldApply } from './records';
import { emptyReview } from './engine';
import type { Annotation } from '../types';

const ann = (id: string, comment = ''): Annotation => ({ id, docId: 'd1', page: 1, rects: [{ x: 0, y: 0, w: 0.1, h: 0.01 }], quote: 'q', kind: 'strength', comment, createdAt: 1, updatedAt: 1 });

describe('record mapping', () => {
  it('decomposes a review into keyed records', () => {
    const r = emptyReview('r1', 1);
    r.title = 'T';
    r.scores.importance = { score: 2, comment: 'x' };
    r.annotations.push(ann('a1'));
    r.docs.push({ id: 'd1', name: 'a.pdf', size: 1, pages: 3, addedAt: 1, role: 'application' });
    r.visited.d1 = [3, 1];
    const m = reviewToRecords(r);
    expect((m.get('meta') as { title: string }).title).toBe('T');
    expect(m.get('score:importance')).toEqual({ score: 2, comment: 'x' });
    expect(m.has('ann:a1')).toBe(true);
    expect(m.get('visited:d1')).toEqual([1, 3]);
  });

  it('diffs only what changed and emits tombstones for removals', () => {
    const a = emptyReview('r1', 1);
    a.annotations.push(ann('a1'), ann('a2'));
    a.scores.rigor = { score: 3, comment: '' };
    const b = produce(a, (d) => {
      d.annotations = d.annotations.filter((x) => x.id !== 'a2');
      d.scores.rigor = { score: 4, comment: '' };
      d.draft.summary = 'hello';
    });
    const changes = diffRecords(a, b);
    const keys = changes.map((c) => `${c.deleted ? '-' : '+'}${c.key}`).sort();
    expect(keys).toEqual(['+draft:summary', '+score:rigor', '-ann:a2']);
  });

  it('applies records, unions visited pages, and sums per-device active time', () => {
    const r = emptyReview('r1', 1);
    r.visited.d1 = [1, 2];
    const next = produce(r, (d) => {
      applyRecord(d, 'visited:d1', [2, 5], false);
      applyRecord(d, 'active:phone', 60000, false);
      applyRecord(d, 'active:laptop', 30000, false);
      applyRecord(d, 'ann:a9', ann('a9', 'remote'), false);
      applyRecord(d, 'meta', { title: 'Renamed', frameworkId: 'nsf', createdAt: 1, focusCriterionId: null }, false);
      applyRecord(d, 'ann:a9', null, true);
    });
    expect(next.visited.d1).toEqual([1, 2, 5]);
    expect(next.activeMs).toBe(90000);
    expect(next.title).toBe('Renamed');
    expect(next.frameworkId).toBe('nsf');
    expect(next.annotations.find((a) => a.id === 'a9')).toBeUndefined();
  });
});

describe('shouldApply', () => {
  it('skips this device\'s own echo and older records, applies newer ones, always merges merge keys', () => {
    expect(shouldApply('ann:a1', 100, 100)).toBe(false);
    expect(shouldApply('ann:a1', 90, 100)).toBe(false);
    expect(shouldApply('ann:a1', 101, 100)).toBe(true);
    expect(shouldApply('ann:a1', 1, undefined)).toBe(true);
    expect(shouldApply('visited:d1', 1, 100)).toBe(true);
  });
});

describe('meta record carries archive state and due date', () => {
  it('round-trips both, and clears them when absent', () => {
    const base: Review = { id: 'r', title: 'T', createdAt: 1, updatedAt: 1, frameworkId: 'generic', docs: [], annotations: [], scores: {}, overall: { comment: '' }, checklist: {}, draft: { summary: '', additional: '', confidential: '' }, facts: {}, visited: {}, lastPage: {}, activeMs: 0 };
    const meta = reviewToRecords({ ...base, archivedAt: 123, dueDate: '2026-10-15' }).get('meta') as Record<string, unknown>;
    expect(meta).toMatchObject({ archivedAt: 123, dueDate: '2026-10-15' });
    const target = { ...base };
    applyRecord(target, 'meta', meta, false);
    expect(target.archivedAt).toBe(123);
    expect(target.dueDate).toBe('2026-10-15');
    applyRecord(target, 'meta', reviewToRecords(base).get('meta'), false);
    expect(target.archivedAt).toBeUndefined();
    expect(target.dueDate).toBeUndefined();
  });
});

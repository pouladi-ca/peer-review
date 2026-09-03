import { describe, it, expect } from 'vitest';
import { computeReadiness } from './readiness';
import { getFramework } from './frameworks';
import type { Annotation, Review } from './types';

function newReview(partial: Partial<Review> = {}): Review {
  const now = Date.now();
  return {
    id: 'r1', title: 'T', createdAt: now, updatedAt: now, frameworkId: 'nih-2025',
    docs: [{ id: 'd1', name: 'a.pdf', size: 1, pages: 5, addedAt: now, role: 'application' }],
    annotations: [], scores: {}, overall: { comment: '' }, checklist: {},
    draft: { summary: '', additional: '', confidential: '' }, facts: {}, visited: {}, lastPage: {}, activeMs: 0,
    ...partial,
  };
}

function ann(p: Partial<Annotation>): Annotation {
  const now = Date.now();
  return { id: Math.random().toString(36).slice(2), docId: 'd1', page: 1, rects: [{ x: 0, y: 0, w: 0.1, h: 0.02 }], quote: 'q', kind: 'strength', comment: '', createdAt: now, updatedAt: now, ...p };
}

const fw = getFramework('nih-2025');

describe('computeReadiness', () => {
  it('flags every unscored core criterion as a blocker', () => {
    const r = computeReadiness(newReview(), fw);
    const core = fw.criteria.filter((c) => c.group === 'core');
    const scoreBlockers = r.blockers.filter((b) => b.id.startsWith('score-'));
    expect(scoreBlockers.length).toBe(core.length);
    expect(r.ready).toBe(false);
  });

  it('requires an overall score and rationale', () => {
    const r = computeReadiness(newReview(), fw);
    expect(r.blockers.some((b) => b.id === 'overall-score')).toBe(true);
    expect(r.blockers.some((b) => b.id === 'overall-rationale')).toBe(true);
  });

  it('is ready when all core criteria and the overall are complete', () => {
    const scores: Review['scores'] = {};
    for (const c of fw.criteria.filter((c) => c.group === 'core')) scores[c.id] = { score: 3, comment: 'A solid rationale that is clearly long enough.' };
    const r = computeReadiness(newReview({ scores, overall: { score: 3, comment: 'A clear overall rationale for the score.' } }), fw);
    expect(r.blockers).toHaveLength(0);
    expect(r.ready).toBe(true);
  });

  it('suggests balance when a criterion has weaknesses but no strengths', () => {
    const scores: Review['scores'] = { importance: { score: 5, comment: '' } };
    const r = computeReadiness(newReview({ scores, annotations: [ann({ kind: 'weakness', criterionId: 'importance' })] }), fw);
    expect(r.suggestions.some((s) => s.id === 'balance-importance')).toBe(true);
  });

  it('suggests explaining a fix for a major weakness with no comment', () => {
    const r = computeReadiness(newReview({ annotations: [ann({ kind: 'weakness', severity: 'major', comment: '' })] }), fw);
    expect(r.suggestions.some((s) => s.id === 'major-fix')).toBe(true);
  });

  it('suggests confirming conflict of interest until set', () => {
    const r = computeReadiness(newReview(), fw);
    expect(r.suggestions.some((s) => s.id === 'coi')).toBe(true);
    const r2 = computeReadiness(newReview({ checklist: { 'r-coi': { state: 'yes', note: '' } } }), fw);
    expect(r2.suggestions.some((s) => s.id === 'coi')).toBe(false);
  });

  it('builds a scorecard row per core criterion with evidence counts', () => {
    const scores: Review['scores'] = { importance: { score: 2, comment: 'strong' } };
    const r = computeReadiness(newReview({ scores, annotations: [ann({ kind: 'strength', criterionId: 'importance' }), ann({ kind: 'weakness', criterionId: 'importance' })] }), fw);
    const row = r.rows.find((x) => x.id === 'importance')!;
    expect(row.scored).toBe(true);
    expect(row.strengths).toBe(1);
    expect(row.weaknesses).toBe(1);
    expect(row.goodness).toBeGreaterThan(0.5); // score 2 on a 1-best-of-9 scale is good
  });
});

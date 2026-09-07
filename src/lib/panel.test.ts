import { describe, it, expect } from 'vitest';
import { draftAsk, draftPitch, panelCardText, topNotes } from './panel';
import { getFramework } from './frameworks';
import type { Annotation, Review } from './types';

const note = (p: Partial<Annotation>): Annotation => ({ id: Math.random().toString(36).slice(2), docId: 'd1', page: 3, rects: [], quote: 'quoted passage', kind: 'strength', comment: '', createdAt: 0, updatedAt: 0, ...p });
const review = (p: Partial<Review> = {}): Review => ({
  id: 'r1', title: 'Untitled', createdAt: 0, updatedAt: 0, frameworkId: 'nih-2025', docs: [], annotations: [], scores: {}, overall: { comment: '' }, checklist: {},
  draft: { summary: '', additional: '', confidential: '' }, facts: {}, visited: {}, lastPage: {}, activeMs: 0, ...p,
});
const fw = getFramework('nih-2025');

describe('panel card', () => {
  it('ranks major weaknesses and commented notes first', () => {
    const r = review({ annotations: [note({ kind: 'weakness', comment: '', page: 1 }), note({ kind: 'weakness', severity: 'minor', comment: 'typo', page: 2 }), note({ kind: 'weakness', severity: 'major', comment: 'no controls', page: 9 })] });
    expect(topNotes(r, 'weakness', 2).map((a) => a.comment)).toEqual(['no controls', '']);
  });

  it('drafts a two-sentence pitch from facts, score, and the top notes', () => {
    const r = review({
      facts: { title: 'A Study of Things', pi: 'Dr. Test', aims: ['Aim 1: To do a thing.', 'Aim 2: To do another.'] },
      overall: { score: 2, comment: '' },
      annotations: [note({ kind: 'strength', comment: 'The preliminary data are convincing' }), note({ kind: 'weakness', severity: 'major', comment: 'No power analysis' })],
    });
    expect(draftPitch(r, fw)).toBe('“A Study of Things” from Dr. Test proposes 2 aims: To do a thing; To do another. I scored it 2 Outstanding: the main strength is the preliminary data are convincing, and the main concern is no power analysis.');
    expect(draftPitch(review({ title: 'Bare' }), fw)).toMatch(/^“Bare” proposes .* I have not settled on a score yet\.$/);
  });

  it('drafts questions from question notes and renders the whole card', () => {
    const r = review({ annotations: [note({ kind: 'question', comment: 'How is blinding maintained?', page: 4 })], overall: { score: 3, comment: '' }, panel: { pitch: 'My pitch.', ask: '', log: [{ id: 'l1', at: 0, who: 'R2', text: 'Agrees on Aim 1.' }], finalScore: 4, finalReason: 'feasibility' } });
    expect(draftAsk(r)).toBe('• How is blinding maintained? (p. 4)');
    const card = panelCardText(r, fw);
    expect(card).toContain('My score: 3 Excellent');
    expect(card).toContain('After discussion: 4 Very Good (feasibility)');
    expect(card).toContain('My pitch.');
    expect(card).toContain('R2: Agrees on Aim 1.');
  });
});

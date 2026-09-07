import { describe, it, expect } from 'vitest';
import { phrasesFor, placeholders, PHRASEBOOK } from './phrasebook';
import { calibration, impliedGoodness, scaleGoodness, wordsFor } from './intensity';
import { composeFromEvidence, sentenceFor } from './compose';
import { appendParagraph, insertAtCaret } from './insert';
import { NIH_SCALE } from '../frameworks';
import type { Annotation, DocMeta } from '../types';

const docs: DocMeta[] = [{ id: 'd1', name: 'app.pdf', size: 1, pages: 9, addedAt: 0, role: 'application' }];
const note = (p: Partial<Annotation>): Annotation => ({ id: 'n', docId: 'd1', page: 4, rects: [], quote: 'no power analysis is presented', kind: 'weakness', comment: 'sample size is not justified', createdAt: 0, updatedAt: 0, ...p });

describe('phrasebook', () => {
  it('ranks phrases that fit the criterion first and filters by use', () => {
    const list = phrasesFor(['strength', 'major'], { name: 'Feasibility', keywords: ['timeline', 'feasibility', 'recruitment'] });
    expect(list.length).toBeGreaterThan(5);
    expect(list[0].hints?.some((h) => ['feasibility', 'timeline', 'recruitment'].includes(h))).toBe(true);
    expect(list.every((ph) => ph.use === 'strength' || ph.use === 'major')).toBe(true);
    // Criterion-specific phrases for other criteria are left out; general ones stay.
    expect(list.some((ph) => ph.id === 'st14')).toBe(false);
    expect(list.some((ph) => ph.id === 'st1')).toBe(true);
  });

  it('every phrase is a sentence with well-formed placeholders', () => {
    for (const ph of PHRASEBOOK) {
      expect(ph.text).toMatch(/[.?]$/);
      expect((ph.text.match(/\{/g) ?? []).length).toBe((ph.text.match(/\}/g) ?? []).length);
    }
    expect(placeholders('A {b} and {c}.')).toEqual([{ start: 2, end: 5 }, { start: 10, end: 13 }]);
  });

  it('searches by text', () => {
    expect(phrasesFor(['summary', 'weighing'], undefined, 'enthusiasm').map((p) => p.id)).toContain('w3');
  });
});

describe('intensity ladder', () => {
  it('maps scores to goodness and suggests words by band', () => {
    expect(scaleGoodness(NIH_SCALE, 1)).toBe(1);
    expect(scaleGoodness(NIH_SCALE, 9)).toBe(0);
    expect(wordsFor(1).praise).toContain('exceptional');
    expect(wordsFor(0).concern).toContain('fatal');
    expect(scaleGoodness({ kind: 'categorical', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] }, 'c')).toBe(0);
  });

  it('reads the intensity of evaluative language', () => {
    expect(impliedGoodness('The approach is rigorous and the team is highly qualified; a minor concern is the timeline.')).toBeGreaterThan(0.7);
    expect(impliedGoodness('A significant weakness undermines Aim 2 and the premise is not credible.')).toBeLessThan(0.2);
    expect(impliedGoodness('The applicant proposes three aims.')).toBeUndefined();
  });

  it('flags wording that contradicts the score, and stays quiet otherwise', () => {
    const harsh = 'A significant weakness undermines Aim 2; the premise is not credible and the plan is not feasible.';
    expect(calibration(harsh, NIH_SCALE, 2)?.direction).toBe('weaker');
    expect(calibration(harsh, NIH_SCALE, 8)).toBeNull();
    const glowing = 'The design is rigorous, the team outstanding, and the preliminary data compelling.';
    expect(calibration(glowing, NIH_SCALE, 7)?.direction).toBe('stronger');
    expect(calibration(glowing, NIH_SCALE, 1)).toBeNull();
    expect(calibration('Three aims are proposed.', NIH_SCALE, 5)).toBeNull();
  });
});

describe('evidence composer', () => {
  it('writes a major weakness with its quote, page, and a constructive tail', () => {
    const s = sentenceFor(note({ severity: 'major' }), docs);
    expect(s).toBe('A significant weakness is that sample size is not justified (p. 4: “no power analysis is presented”). Addressing this would strengthen the application.');
  });

  it('adapts to kind and severity, and never invents content', () => {
    expect(sentenceFor(note({ kind: 'strength', comment: 'The controls are appropriate', quote: '' }), docs)).toBe('The controls are appropriate (p. 4).');
    expect(sentenceFor(note({ kind: 'question', comment: 'how blinding will be maintained?' }), docs)).toBe('It is unclear how blinding will be maintained (p. 4: “no power analysis is presented”); the applicants should clarify this.');
    expect(sentenceFor(note({ kind: 'question', comment: 'the cohort is large enough' }), docs)).toMatch(/^It is unclear whether the cohort is large enough/);
    expect(sentenceFor(note({ severity: 'minor', comment: 'typo in Figure 2' }), docs)).toBe('A minor point: Typo in Figure 2 (p. 4: “no power analysis is presented”).');
    expect(sentenceFor(note({ comment: '', kind: 'note' }), docs)).toBe('See “no power analysis is presented” (p. 4).');
  });

  it('skips notes already reflected in the rationale and orders strengths before weaknesses', () => {
    const notes = [note({ id: 'w', severity: 'major' }), note({ id: 's', kind: 'strength', comment: 'Strong preliminary data on the biomarker', quote: 'we observed a 2-fold change', page: 2 })];
    const out = composeFromEvidence(notes, docs, '');
    expect(out[0]).toMatch(/^Strong preliminary data/);
    expect(out[1]).toMatch(/^A significant weakness/);
    expect(composeFromEvidence(notes, docs, 'As noted, sample size is not justified by any analysis.')).toHaveLength(1);
  });
});

describe('insertion', () => {
  it('inserts at the caret with spacing and selects the first placeholder', () => {
    const r = insertAtCaret('The aims are clear.', 19, 19, 'A major strength is {specific}, which {why}.');
    expect(r.value).toBe('The aims are clear. A major strength is {specific}, which {why}.');
    expect(r.value.slice(r.select.start, r.select.end)).toBe('{specific}');
    const mid = insertAtCaret('ab', 1, 1, 'X.');
    expect(mid.value).toBe('a X. b');
  });

  it('appends a paragraph after a blank line', () => {
    expect(appendParagraph('One.\n', 'Two.').value).toBe('One.\n\nTwo.');
    expect(appendParagraph('', 'Two.').value).toBe('Two.');
  });
});

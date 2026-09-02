import { describe, it, expect } from 'vitest';
import { composeDraft, draftToMarkdown, draftToPlainText, autoSummary } from './draft';
import { getFramework } from './frameworks';
import type { Annotation, Review } from './types';

function newReview(partial: Partial<Review> = {}): Review {
  const now = Date.now();
  return {
    id: 'r1',
    title: 'Untitled review',
    createdAt: now,
    updatedAt: now,
    frameworkId: 'generic',
    docs: [],
    annotations: [],
    scores: {},
    overall: { comment: '' },
    checklist: {},
    draft: { summary: '', additional: '', confidential: '' },
    facts: {},
    visited: {},
    lastPage: {},
    activeMs: 0,
    ...partial,
  };
}

function annotation(partial: Partial<Annotation>): Annotation {
  const now = Date.now();
  return { id: Math.random().toString(36).slice(2), docId: 'd1', page: 1, rects: [{ x: 0, y: 0, w: 0.2, h: 0.02 }], quote: 'quoted text', kind: 'strength', comment: '', createdAt: now, updatedAt: now, ...partial };
}

function sampleReview(): Review {
  const r = newReview({ frameworkId: 'nih-2025', title: 'Test review' });
  r.docs = [{ id: 'd1', name: 'app.pdf', size: 100, pages: 5, addedAt: Date.now(), role: 'application' }];
  r.facts = { title: 'A Study of Things', pi: 'Dr. Test', aims: ['Aim 1: To do a thing.', 'Aim 2: To do another.'], budget: '$1,000,000', duration: '5 years' };
  r.annotations = [
    annotation({ page: 2, kind: 'strength', criterionId: 'importance', quote: 'important problem', comment: 'addresses a real barrier' }),
    annotation({ page: 3, kind: 'weakness', criterionId: 'rigor', severity: 'major', quote: 'no power analysis', comment: 'sample size is not justified' }),
    annotation({ page: 3, kind: 'weakness', criterionId: 'rigor', severity: 'minor', quote: 'small typo', comment: 'a minor issue' }),
    annotation({ page: 4, kind: 'question', criterionId: 'expertise', quote: 'who does the stats', comment: 'is a statistician on the team?' }),
    annotation({ page: 5, kind: 'note', quote: 'general remark' }),
  ];
  r.scores = {
    importance: { score: 2, comment: 'Strong significance.' },
    rigor: { score: 5, comment: 'Approach is reasonable but under-powered.' },
    expertise: { score: 'appropriate', comment: '' },
  };
  r.overall = { score: 3, comment: 'A strong application with a fixable rigor gap.', recommendation: undefined };
  r.draft.summary = 'This application studies things.';
  return r;
}

describe('composeDraft', () => {
  const fw = getFramework('nih-2025');
  const draft = composeDraft(sampleReview(), fw);

  it('groups notes under the right criteria', () => {
    const importance = draft.sections.find((s) => s.heading.includes('Importance'));
    expect(importance?.strengths.length).toBe(1);
    const rigor = draft.sections.find((s) => s.heading.includes('Rigor'));
    expect(rigor?.weaknesses.length).toBe(2);
  });

  it('orders weaknesses major before minor', () => {
    const rigor = draft.sections.find((s) => s.heading.includes('Rigor'))!;
    expect(rigor.weaknesses[0].severity).toBe('major');
    expect(rigor.weaknesses[0].text).toContain('Major:');
  });

  it('puts an unassigned note in general comments', () => {
    const general = draft.sections.find((s) => s.id === 'general');
    expect(general?.notes.length).toBe(1);
  });

  it('includes page references in bullets', () => {
    const importance = draft.sections.find((s) => s.heading.includes('Importance'))!;
    expect(importance.strengths[0].text).toContain('p. 2');
  });

  it('collects a global questions list', () => {
    expect(draft.questions.length).toBe(1);
    expect(draft.questions[0].text).toContain('statistician');
  });

  it('counts stats', () => {
    expect(draft.stats.strengths).toBe(1);
    expect(draft.stats.weaknesses).toBe(2);
    expect(draft.stats.major).toBe(1);
    expect(draft.stats.questions).toBe(1);
  });

  it('renders a scored overall line', () => {
    expect(draft.overall.scoreLine).toContain('3');
  });
});

describe('markdown export', () => {
  const fw = getFramework('nih-2025');
  const md = draftToMarkdown(composeDraft(sampleReview(), fw));

  it('has a title and section headings', () => {
    expect(md).toContain('# Review: Test review');
    expect(md).toContain('## Factor 1: Importance of the Research');
    expect(md).toContain('**Strengths**');
    expect(md).toContain('**Weaknesses**');
  });

  it('includes the overall rating', () => {
    expect(md).toMatch(/## Overall Impact/);
  });

  it('omits confidential comments unless requested', () => {
    const r = sampleReview();
    r.draft.confidential = 'secret note';
    expect(draftToMarkdown(composeDraft(r, fw))).not.toContain('secret note');
    expect(draftToMarkdown(composeDraft(r, fw), { includeConfidential: true })).toContain('secret note');
  });

  it('plain text strips markdown syntax', () => {
    const txt = draftToPlainText(composeDraft(sampleReview(), fw));
    expect(txt).not.toContain('##');
    expect(txt).not.toContain('**');
    expect(txt).toContain('•');
  });
});

describe('autoSummary', () => {
  it('mentions the title and aim count', () => {
    const s = autoSummary(sampleReview());
    expect(s).toContain('A Study of Things');
    expect(s).toContain('2 aims');
  });
});

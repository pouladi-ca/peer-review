import { describe, it, expect } from 'vitest';
import { lintApplicantFacing, lintRationale, repeatedPhrases } from './lints';
import { biasCheck } from './bias';
import { extractTerms, suggest, wordBeforeCaret } from './vocab';

describe('lints', () => {
  const L = { hasEvidence: false, label: 'Approach' };
  it('asks for specificity when a judgement has no page, quote, or tagged evidence', () => {
    expect(lintRationale('The design is rigorous and the controls are appropriate.', L).map((l) => l.id)).toContain('specific');
    expect(lintRationale('The design is rigorous (p. 4).', L).map((l) => l.id)).not.toContain('specific');
    expect(lintRationale('The design is rigorous.', { ...L, hasEvidence: true }).map((l) => l.id)).not.toContain('specific');
    expect(lintRationale('Three aims are proposed.', L)).toHaveLength(0);
  });

  it('flags leftover blanks, contradictions, long sentences, and filler', () => {
    const ids = lintRationale('A major strength is {specific}. The approach is innovative (p. 2) yet largely incremental. It should be noted that ' + 'the plan '.repeat(46) + 'ends here.', L).map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['blank', 'contra-innovative', 'long']));
    expect(ids.some((id) => id.startsWith('filler-'))).toBe(true);
    expect(lintRationale('The plan is not feasible (p. 3).', L).map((l) => l.id)).not.toContain('contra-feasible');
  });

  it('notices boilerplate repeated across boxes', () => {
    const out = repeatedPhrases({ Approach: 'The applicants have not addressed the alternative here.', Significance: 'Again the applicants have not addressed the alternative explanation.' });
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Approach and Significance/);
    expect(repeatedPhrases({ A: 'one two three four five', B: 'six seven eight nine ten' })).toHaveLength(0);
  });

  it('keeps panel talk out of feedback for the applicant', () => {
    expect(lintApplicantFacing('I would score this a 3; the panel may triage it.', 'Feedback')).toHaveLength(1);
    expect(lintApplicantFacing('Consider adding a power analysis for Aim 2.', 'Feedback')).toHaveLength(0);
  });
});

describe('bias guard', () => {
  it('flags person-focused wording and conflicts, with a reason', () => {
    const hits = biasCheck('Impressive for a young investigator from a small institution; I have worked with her and the English is poor.');
    expect(hits.map((h) => h.id)).toEqual(expect.arrayContaining(['stage-as-limit', 'institution', 'coi-know', 'language']));
    expect(hits[0].reason.length).toBeGreaterThan(10);
  });
  it('reports one note per passage, the most specific', () => {
    const hits = biasCheck('Impressive for a young investigator.');
    expect(hits.map((h) => h.id)).toEqual(['stage-as-limit']);
  });
  it('stays quiet on ordinary critique', () => {
    expect(biasCheck('The early-stage investigator has the required expertise, and the environment provides the core facilities.')).toHaveLength(0);
  });
});

describe('vocabulary', () => {
  const texts = ['We propose that astrocyte-derived exosomal miR-133b drives synaptic repair. Exosomes carry miR-133b to peri-infarct neurons via the RhoA/ROCK pathway. HD-ISS staging and cUHDRS are used. The Vasquez lab, Vasquez et al., Vasquez 2024.', 'Exosomes and neurodegeneration; neurodegeneration is progressive. The The The The.'];
  it('extracts symbols, acronyms, hyphenated terms, names, and long words', () => {
    const terms = extractTerms(texts).map((t) => t.text);
    expect(terms).toEqual(expect.arrayContaining(['miR-133b', 'RhoA/ROCK', 'HD-ISS', 'cUHDRS', 'Vasquez', 'Exosomes', 'neurodegeneration']));
    expect(terms).not.toContain('The');
    expect(terms).not.toContain('We');
  });
  it('drops tokens that are two known words glued together', () => {
    const terms = extractTerms(['exosomal miR-133b, exosomal miR-133b, and exosomalmiR-133b once glued; exosomal again.']).map((t) => t.text);
    expect(terms).toContain('exosomal');
    expect(terms).toContain('miR-133b');
    expect(terms).not.toContain('exosomalmiR-133b');
  });
  it('suggests continuations of the word at the caret', () => {
    const terms = extractTerms(texts);
    const { start, text } = wordBeforeCaret('The role of exo', 15);
    expect(start).toBe(12);
    expect(text).toBe('exo');
    expect(suggest(terms, 'exo').map((t) => t.text)).toContain('Exosomes');
    expect(suggest(terms, 'mir').map((t) => t.text)).toEqual(['miR-133b']);
    expect(suggest(terms, 'ex')).toHaveLength(0);
    expect(suggest(terms, 'Exosomes')).toHaveLength(0);
  });
});

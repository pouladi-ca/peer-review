import { describe, it, expect } from 'vitest';
import type { PageText, TextLine, TextRun } from '../types';
import { detectOutline, criterionForHint, sectionAt } from './outline';
import { extractFacts } from './facts';
import { findEvidence, rectForOffset, snippetAround } from './checklist';
import { searchPages } from './search';
import { detectFramework, getFramework, scoreLabel, NIH_SCALE } from '../frameworks';

/** Build a PageText from lines described as [text, fontSize, yTop]. */
function makePage(page: number, lines: [string, number, number][]): PageText {
  const textLines: TextLine[] = [];
  const runs: TextRun[] = [];
  for (const [text, size, y] of lines) {
    textLines.push({ text, size, y, x: 0.1, page });
    runs.push({ str: text, x: 0.1, y, w: Math.min(0.8, text.length * 0.008), h: 0.02, size });
  }
  return { page, width: 612, height: 792, text: lines.map((l) => l[0]).join('\n'), lines: textLines, runs };
}

describe('frameworks', () => {
  it('detects agency from text', () => {
    expect(detectFramework('This R01 application to the National Institutes of Health with Specific Aims')).toBe('nih-2025');
    expect(detectFramework('NSF proposal addressing Intellectual Merit and Broader Impacts')).toBe('nsf');
    expect(detectFramework('CIHR Project Grant application')).toBe('cihr-project');
    expect(detectFramework('European Research Council Starting Grant')).toBe('erc');
    expect(detectFramework('a generic proposal about widgets')).toBeUndefined();
  });

  it('labels NIH scores with the 1-is-best convention', () => {
    expect(scoreLabel(NIH_SCALE, 1)).toBe('1 Exceptional');
    expect(scoreLabel(NIH_SCALE, 9)).toBe('9 Poor');
    expect(scoreLabel(NIH_SCALE, undefined)).toBe('');
  });

  it('labels CIHR banded overall scores by threshold', () => {
    const fw = getFramework('cihr-project');
    expect(scoreLabel(fw.overall.scale, 4.6)).toContain('Outstanding');
    expect(scoreLabel(fw.overall.scale, 3.2)).toContain('Good');
    expect(scoreLabel(fw.overall.scale, 1.0)).toContain('Not acceptable');
  });

  it('every framework has core criteria and a checklist', () => {
    for (const fw of ['nih-2025', 'nih-legacy', 'nsf', 'cihr-project', 'erc', 'generic'].map(getFramework)) {
      expect(fw.criteria.filter((c) => c.group === 'core').length).toBeGreaterThan(0);
      expect(fw.checklist.length).toBeGreaterThan(4);
      expect(fw.checklist.some((c) => c.category === 'reviewer')).toBe(true);
    }
  });

  it('maps outline hints to NIH criteria', () => {
    const fw = getFramework('nih-2025');
    expect(criterionForHint(fw, 'approach')).toBe('rigor');
    expect(criterionForHint(fw, 'significance')).toBe('importance');
    expect(criterionForHint(fw, 'expertise')).toBe('expertise');
  });
});

describe('outline detection', () => {
  const pages = [
    makePage(1, [
      ['A Grand Proposal Title', 15, 0.1],
      ['Specific Aims', 13, 0.3],
      ['We propose to cure things.', 10.5, 0.4],
      ['Significance', 13, 0.6],
      ['This matters a lot.', 10.5, 0.7],
    ]),
    makePage(2, [
      ['Approach', 13, 0.1],
      ['We will do experiments.', 10.5, 0.2],
      ['Statistical Analysis', 11, 0.5],
      ['We use mixed models.', 10.5, 0.6],
      ['References Cited', 13, 0.8],
    ]),
  ];
  const fw = getFramework('nih-2025');
  const outline = detectOutline(pages, fw);

  it('finds the major headings', () => {
    const titles = outline.map((o) => o.title);
    expect(titles).toContain('Specific Aims');
    expect(titles).toContain('Significance');
    expect(titles).toContain('Approach');
    expect(titles).toContain('References Cited');
  });

  it('assigns criterion hints', () => {
    expect(outline.find((o) => o.title === 'Significance')?.criterionHint).toBe('significance');
    expect(outline.find((o) => o.title === 'Approach')?.criterionHint).toBe('approach');
  });

  it('nests statistical analysis as a subsection', () => {
    expect(outline.find((o) => o.title === 'Statistical Analysis')?.level).toBe(2);
  });

  it('sectionAt returns the enclosing section', () => {
    const s = sectionAt(outline, 2, 0.3);
    expect(s?.title).toBe('Approach');
  });
});

describe('fact extraction', () => {
  const pages = [
    makePage(1, [
      ['Astrocyte Exosomes Drive Repair', 16, 0.1],
      ['Principal Investigator: Dr. Elena Vasquez', 10.5, 0.25],
      ['Institution: Cascade University', 10.5, 0.3],
      ['Funding Mechanism: NIH R01', 10.5, 0.35],
      ['Requested Budget: $1,984,500 direct costs over 5 years', 10.5, 0.4],
    ]),
    makePage(2, [
      ['Specific Aims', 13, 0.1],
      ['Aim 1: To determine the mechanism of repair in cortical neurons.', 10.5, 0.2],
      ['Aim 2: To establish necessity in a stroke model.', 10.5, 0.3],
      ['Aim 3: To evaluate an engineered exosome therapeutic.', 10.5, 0.4],
    ]),
  ];
  const facts = extractFacts(pages);

  it('reads the title, PI, institution, mechanism, budget', () => {
    expect(facts.title).toContain('Astrocyte');
    expect(facts.pi).toContain('Vasquez');
    expect(facts.institution).toContain('Cascade');
    expect(facts.mechanism).toBe('R01');
    expect(facts.budget).toBe('$1,984,500');
    expect(facts.duration).toMatch(/5 year/);
  });

  it('extracts three aims', () => {
    expect(facts.aims?.length).toBe(3);
    expect(facts.aims?.[0]).toMatch(/^Aim 1: To determine/);
  });

  it('counts words', () => {
    expect(facts.words).toBeGreaterThan(20);
  });
});

describe('checklist evidence', () => {
  const fw = getFramework('nih-2025');
  const pages = [
    makePage(1, [
      ['We hypothesize that miR-133b drives repair.', 10.5, 0.1],
      ['A power analysis indicates n = 16 per group for 80% power.', 10.5, 0.2],
      ['The experimenter was blinded and animals randomised.', 10.5, 0.3],
      ['Sex is included as a biological variable.', 10.5, 0.4],
      ['Data will be deposited in GEO and code on GitHub.', 10.5, 0.5],
    ]),
  ];
  const evidence = findEvidence(fw.checklist, pages);

  it('locates hypothesis, power, blinding, sex, data sharing', () => {
    expect(evidence.hypothesis.length).toBeGreaterThan(0);
    expect(evidence.sampleSize.length).toBeGreaterThan(0);
    expect(evidence.blinding.length).toBeGreaterThan(0);
    expect(evidence.sex.length).toBeGreaterThan(0);
    expect(evidence.dataSharing.length).toBeGreaterThan(0);
  });

  it('returns a rect and snippet for a hit', () => {
    const hit = evidence.hypothesis[0];
    expect(hit.page).toBe(1);
    expect(hit.snippet).toContain('hypothesize');
    expect(hit.rect).toBeDefined();
  });

  it('reports nothing for an absent item', () => {
    expect(evidence.animals?.length ?? 0).toBe(0);
  });
});

describe('helpers', () => {
  it('snippetAround adds ellipses', () => {
    const s = snippetAround('the quick brown fox jumps over the lazy dog again and again', 16, 5, 8);
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });

  it('rectForOffset finds the run for an offset', () => {
    const page = makePage(1, [['hello world', 10, 0.2], ['second line here', 10, 0.4]]);
    const rect = rectForOffset(page, page.text.indexOf('second'), 6);
    expect(rect).toBeDefined();
    expect(rect!.y).toBeCloseTo(0.4, 5);
  });

  it('search finds matches with rects', () => {
    const page = makePage(1, [['the RhoA pathway is inhibited', 10, 0.2]]);
    const hits = searchPages('d1', [page], 'RhoA');
    expect(hits.length).toBe(1);
    expect(hits[0].rect).toBeDefined();
  });
});

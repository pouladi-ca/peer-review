import { describe, it, expect } from 'vitest';
import { FRAMEWORKS, allFrameworks, customToFramework, detectFramework, frameworkToCustomDef, getFramework, setCustomFrameworks, scoreLabel, type CustomFrameworkDef } from './frameworks';

describe('built-in frameworks', () => {
  it('ships twelve frameworks with core criteria, scales, and checklists', () => {
    expect(FRAMEWORKS.length).toBe(12);
    for (const fw of FRAMEWORKS) {
      expect(fw.criteria.filter((c) => c.group === 'core').length).toBeGreaterThan(0);
      expect(fw.checklist.some((c) => c.category === 'reviewer')).toBe(true);
      expect(fw.overall.label.length).toBeGreaterThan(0);
    }
  });

  it('detects the newer agencies from text', () => {
    expect(detectFramework('Proposal submitted under Horizon Europe topic HORIZON-HLTH-2025')).toBe('horizon-europe');
    expect(detectFramework('NSERC Discovery Grant application')).toBe('nserc-discovery');
    expect(detectFramework('NHMRC Ideas Grant scheme')).toBe('nhmrc-ideas');
    expect(detectFramework('Wellcome Discovery Award')).toBe('wellcome');
    expect(detectFramework('Case for Support to the Medical Research Council')).toBe('ukri');
    expect(detectFramework('Antrag an die Deutsche Forschungsgemeinschaft (DFG)')).toBe('dfg');
  });

  it('labels Horizon Europe half-point scores by band', () => {
    const fw = getFramework('horizon-europe');
    expect(scoreLabel(fw.criterionScale, 4.5)).toContain('Very good');
    expect(scoreLabel(fw.overall.scale, 12)).toContain('Above threshold');
  });
});

describe('custom frameworks', () => {
  const def: CustomFrameworkDef = {
    id: 'custom-test',
    name: 'Foundation X',
    agency: 'Foundation X',
    blurb: 'Test rubric',
    criteria: [
      { id: 'c1', name: 'Scientific Merit', short: 'Merit', description: 'How good is the science?', prompts: ['Is it sound?'], group: 'core' },
      { id: 'c2', name: 'Patient Relevance', short: 'Relevance', description: '', prompts: [], group: 'core', scale: { kind: 'categorical', options: [{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }] } },
    ],
    criterionScale: { kind: 'numeric', min: 1, max: 5, bestIsLow: false },
    overall: { label: 'Overall', description: '', scale: { kind: 'numeric', min: 1, max: 5, bestIsLow: false } },
    recommendations: ['Fund', 'Do not fund'],
    createdAt: 1,
    updatedAt: 1,
  };

  it('converts a definition into a usable framework with keywords and a checklist', () => {
    const fw = customToFramework(def);
    expect(fw.custom).toBe(true);
    expect(fw.criteria[0].keywords).toContain('scientific');
    expect(fw.criteria[0].keywords).toContain('merit');
    expect(fw.criteria[1].scale?.kind).toBe('categorical');
    expect(fw.checklist.length).toBeGreaterThan(5);
    expect(fw.recommendations).toEqual(['Fund', 'Do not fund']);
  });

  it('registers custom frameworks so getFramework and allFrameworks resolve them', () => {
    setCustomFrameworks([def]);
    expect(getFramework('custom-test').name).toBe('Foundation X');
    expect(allFrameworks().some((f) => f.id === 'custom-test')).toBe(true);
    setCustomFrameworks([]);
    expect(getFramework('custom-test').id).toBe('generic'); // falls back
  });

  it('duplicates a built-in into an editable definition', () => {
    const copy = frameworkToCustomDef(getFramework('nsf'), 'custom-nsf');
    expect(copy.name).toContain('copy');
    expect(copy.criteria.map((c) => c.short)).toEqual(['Intellectual Merit', 'Broader Impacts', 'Solicitation', 'Data Management', 'Mentoring']);
    const back = customToFramework(copy);
    expect(back.criteria[0].bulleted).toBe(true);
  });
});

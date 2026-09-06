import { describe, it, expect } from 'vitest';
import { FRAMEWORKS, allFrameworks, customToFramework, detectFramework, fieldSpec, frameworkToCustomDef, getFramework, recommendationSpec, setCustomFrameworks, scoreLabel, type CustomFrameworkDef } from './frameworks';

describe('built-in frameworks', () => {
  it('ships fourteen frameworks with core criteria, scales, and checklists', () => {
    expect(FRAMEWORKS.length).toBe(14);
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

  it('detects HDSA and HDF, and prefers them over NIH-style formatting signals', () => {
    expect(detectFramework('Proposal To: HDSA - Human Biology Project')).toBe('hdsa');
    expect(detectFramework("Huntington's Disease Society of America Human Experience Project")).toBe('hdsa');
    expect(detectFramework('Hereditary Disease Foundation postdoctoral fellowship. Specific Aims. NIH biosketch attached.')).toBe('hdf');
    expect(detectFramework('Application to the HDF. Follow NIH formatting guidelines.')).toBe('hdf');
    // A real NIH application still detects as NIH.
    expect(detectFramework('National Institutes of Health R01 Specific Aims')).toBe('nih-2025');
  });

  it('HDSA and HDF frameworks carry their published criteria', () => {
    const hdsa = getFramework('hdsa');
    expect(hdsa.criteria.filter((c) => c.group === 'core').map((c) => c.name)).toEqual(['Impact', 'Scientific Approach', 'Feasibility', 'Strength of Candidate and Mentor lab', 'Clinical Collaboration']);
    const hdf = getFramework('hdf');
    expect(hdf.criteria.map((c) => c.name)).toEqual(['Relevance', 'Novelty', 'Significance', 'Scientific Premise', 'Approach', 'Applicant', 'Environment', 'Budget', 'NIH Guidelines']);
    expect(hdsa.checklist.some((c) => c.id === 'coe')).toBe(true);
  });

  it('HDSA mirrors its ProposalCentral score sheet: comment-only criteria, 2,000-character boxes, one 1 to 9 score', () => {
    const hdsa = getFramework('hdsa');
    const core = hdsa.criteria.filter((c) => c.group === 'core');
    expect(core.every((c) => c.unscored && c.maxChars === 2000)).toBe(true);
    expect(hdsa.overall.scale).toMatchObject({ kind: 'numeric', min: 1, max: 9, bestIsLow: true });
    expect(scoreLabel(hdsa.overall.scale, 1)).toBe('1 Outstanding');
    expect(scoreLabel(hdsa.overall.scale, 4)).toContain('fundable');
    expect(scoreLabel(hdsa.overall.scale, 9)).toBe('9 Poor');
    expect(fieldSpec(hdsa, 'summary')).toMatchObject({ label: 'Comments: Summary', maxChars: 2000, required: true });
    expect(fieldSpec(hdsa, 'additional')).toMatchObject({ label: 'Comments: Other', maxChars: 2000 });
    expect(fieldSpec(hdsa, 'overallComment')).toMatchObject({ label: 'Feedback for the applicant', maxChars: 15000 });
    expect(recommendationSpec(hdsa)).toMatchObject({ label: 'Worthy of discussion?', required: true });
    expect(hdsa.recommendations?.[0]).toMatch(/^Yes/);
    // Frameworks without a form keep the plain defaults.
    expect(fieldSpec(getFramework('nih-2025'), 'summary')).toEqual({ label: 'Summary of the application' });
    expect(recommendationSpec(getFramework('nih-2025')).label).toBe('Recommendation');
  });

  it('keeps comment-only criteria and limits when a built-in framework is duplicated', () => {
    const def = frameworkToCustomDef(getFramework('hdsa'), 'custom-x');
    expect(def.criteria[0]).toMatchObject({ unscored: true, maxChars: 2000 });
    expect(def.form?.summary?.maxChars).toBe(2000);
    const fw = customToFramework(def);
    expect(fw.criteria[0].unscored).toBe(true);
    expect(fieldSpec(fw, 'overallComment').maxChars).toBe(15000);
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

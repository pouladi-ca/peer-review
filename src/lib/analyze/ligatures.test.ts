import { describe, it, expect } from 'vitest';
import { buildLigatureRepair } from './ligatures';

const N = '\u0000';

describe('ligature repair', () => {
  it('is a no-op for clean text', () => {
    const r = buildLigatureRepair(['Budget Justification for the project']);
    expect(r.count).toBe(0);
    expect(r.fix('anything')).toBe('anything');
  });

  it('repairs common words with one or two missing ligatures', () => {
    const r = buildLigatureRepair([`Budget Jus${N}fica${N}on. A signi${N}cant e${N}ort. The ${N}rst e${N}ec${N}ve step.`]);
    expect(r.fix(`Jus${N}fica${N}on`)).toBe('Justification');
    expect(r.fix(`signi${N}cant`)).toBe('significant');
    expect(r.fix(`e${N}ort`)).toBe('effort');
    expect(r.fix(`${N}rst`)).toBe('first');
    expect(r.fix(`e${N}ec${N}ve`)).toBe('effective');
  });

  it('uses the document vocabulary for domain words', () => {
    const r = buildLigatureRepair(['We stained for neurofilament in every section.', `Neuro${N}lament loss was quan${N}${N}ed.`]);
    expect(r.fix(`Neuro${N}lament`)).toBe('Neurofilament');
  });

  it('falls back to the dominant ligature for unknown words', () => {
    const r = buildLigatureRepair([`Jus${N}fica${N}on and iden${N}fica${N}on and a made-up xq${N}zzy term.`]);
    expect(r.dominant).toBe('ti');
    expect(r.fix(`xq${N}zzy`)).toBe('xqtizzy');
  });

  it('repairs quotes containing several tokens', () => {
    const r = buildLigatureRepair([`Sta${N}s${N}cal analysis of the popula${N}on.`]);
    expect(r.fix(`Sta${N}s${N}cal analysis of the popula${N}on.`)).toBe('Statistical analysis of the population.');
  });
});

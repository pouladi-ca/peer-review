import { describe, it, expect } from 'vitest';
import { claimsFromPages, claimsFromReflow } from './claims';
import type { ReflowDoc } from '../reflow/types';

describe('preliminary data index', () => {
  it('finds claim sentences in reflowed blocks with their figure references', () => {
    const doc: ReflowDoc = {
      version: 1, title: 't', pages: [1, 2], blocks: [
        { id: 'b1', type: 'paragraph', page: 2, text: 'Background is long. We have shown that reactive astrocytes secrete exosomes (Fig. 2A). This is unrelated.', runs: [{ t: 'Background is long. We have shown that reactive astrocytes secrete exosomes (' }, { t: 'Fig. 2A', fig: 'f2' }, { t: '). This is unrelated.' }] },
        { id: 'b2', type: 'heading', page: 2, text: 'Preliminary data' },
        { id: 'b3', type: 'paragraph', page: 3, text: 'Our preliminary data indicate a 2-fold change in Table 1. Nothing else here at all.' },
      ], figures: [{ id: 'f2', kind: 'figure', label: 'Figure 2', caption: '', page: 2, src: 'figures/f2.png', w: 1, h: 1 }], toc: [],
    };
    const claims = claimsFromReflow(doc);
    expect(claims.map((c) => c.sentence)).toEqual(['We have shown that reactive astrocytes secrete exosomes (Fig. 2A).', 'Our preliminary data indicate a 2-fold change in Table 1.']);
    expect(claims[0]).toMatchObject({ page: 2, blockId: 'b1', figures: ['f2'], figureLabels: ['Fig. 2A'] });
    expect(claims[1].figureLabels).toEqual(['Table 1']);
  });

  it('falls back to page text and ignores ordinary prose', () => {
    const claims = claimsFromPages([{ page: 4, width: 1, height: 1, lines: [], runs: [], text: 'The field lacks biomarkers. In pilot studies we observed a signal in twelve participants. Aim 1 will test this.' }]);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ page: 4, sentence: 'In pilot studies we observed a signal in twelve participants.' });
    expect(claimsFromPages([{ page: 1, width: 1, height: 1, lines: [], runs: [], text: 'We will determine the mechanism. The team proposes three aims.' }])).toHaveLength(0);
  });
});

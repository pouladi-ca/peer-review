/**
 * The preliminary data index: every sentence in which the applicants claim prior
 * results, each with its page, its block (for the reading view), and the figures it
 * points at. Reviewers spend a disproportionate share of their scepticism here.
 */

import type { ReflowDoc } from '../reflow/types';
import type { PageText } from '../types';

export interface Claim {
  id: string;
  page: number;
  /** Reading-view block, when the reflow is available. */
  blockId?: string;
  sentence: string;
  /** Figure ids referenced in the sentence (reading view), or labels found in the text. */
  figures: string[];
  figureLabels: string[];
}

const CLAIM = /\b(?:we|our (?:lab|laboratory|group|team))\s+(?:have\s+|recently\s+|previously\s+|already\s+)?(?:shown|showed|demonstrated?|found|observed|established|reported|developed|generated|validated|identified|confirmed|discovered|obtained|characteri[sz]ed|optimi[sz]ed)\b|\bpreliminary (?:data|results|studies|study|findings|experiments|evidence|work)\b|\bpilot (?:data|study|studies|experiments?)\b|\bunpublished (?:data|observations|results)\b|\bour (?:preliminary|pilot|published|previous|prior|recent) (?:data|results|studies|study|work|findings)\b/i;
const FIG_LABEL = /\b(?:Fig(?:ure)?s?\.?|Table)\s?[A-Z]?\d+[A-Za-z]?(?:[-–,]\s?\d+[A-Za-z]?)*/g;

const sentences = (text: string): string[] => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z“"(])/).map((s) => s.trim()).filter((s) => s.length > 20);

/** Claims from the reflowed document, with block ids and figure references. */
export function claimsFromReflow(doc: ReflowDoc): Claim[] {
  const out: Claim[] = [];
  const known = new Set(doc.figures.map((f) => f.id));
  for (const b of doc.blocks) {
    if (b.type !== 'paragraph' && b.type !== 'list-item') continue;
    const refs = (b.runs ?? []).filter((r) => r.fig && known.has(r.fig));
    for (const s of sentences(b.text)) {
      if (!CLAIM.test(s)) continue;
      const labels = [...new Set((s.match(FIG_LABEL) ?? []).map((m) => m.replace(/\s+/g, ' ')))];
      // A run's figure reference belongs to this sentence when its text appears in it.
      const figures = [...new Set(refs.filter((r) => s.includes(r.t.trim())).map((r) => r.fig!))];
      out.push({ id: `${b.id}:${out.length}`, page: b.page, blockId: b.id, sentence: s, figures, figureLabels: labels });
    }
  }
  return out;
}

/** Claims from the page text alone, when the reading view has not been built. */
export function claimsFromPages(pages: PageText[]): Claim[] {
  const out: Claim[] = [];
  for (const p of pages) {
    for (const s of sentences(p.text.replace(/-\n/g, '').replace(/\n/g, ' '))) {
      if (!CLAIM.test(s)) continue;
      out.push({ id: `p${p.page}:${out.length}`, page: p.page, sentence: s, figures: [], figureLabels: [...new Set((s.match(FIG_LABEL) ?? []).map((m) => m.replace(/\s+/g, ' ')))] });
    }
  }
  return out;
}

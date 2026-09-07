/**
 * An intensity ladder for evaluative language, tied to the score. The ladder is the
 * thesaurus that helps a reviewer: not synonyms, but rungs. Given a score's position on
 * its scale, `wordsFor` suggests the rung that matches, and `calibration` notices when the
 * wording of a rationale reads much stronger or weaker than the score it accompanies.
 */

import type { ScaleDef } from '../frameworks';

interface Rung {
  level: 1 | 2 | 3 | 4;
  words: string[];
}

/** Praise, from mild to superlative. */
export const PRAISE: Rung[] = [
  { level: 1, words: ['acceptable', 'satisfactory', 'has merit', 'modest', 'reasonable'] },
  { level: 2, words: ['good', 'solid', 'appropriate', 'sound', 'adequate', 'clear', 'credible'] },
  { level: 3, words: ['strong', 'excellent', 'rigorous', 'well designed', 'well-designed', 'convincing', 'thorough', 'highly qualified', 'very good'] },
  { level: 4, words: ['exceptional', 'outstanding', 'superb', 'exemplary', 'compelling', 'transformative', 'highly innovative', 'highly significant'] },
];

/** Concern, from a quibble to a fatal problem. */
export const CONCERN: Rung[] = [
  { level: 1, words: ['minor concern', 'minor weakness', 'minor point', 'would benefit from', 'could be clarified', 'slight', 'small'] },
  { level: 2, words: ['concern', 'weakness', 'limitation', 'unclear', 'not addressed', 'insufficient', 'lacks', 'missing', 'uncertain'] },
  { level: 3, words: ['significant weakness', 'major weakness', 'significant concern', 'serious concern', 'substantial concern', 'undermines', 'not credible', 'not feasible'] },
  { level: 4, words: ['fatal', 'disqualifying', 'fundamental flaw', 'serious flaw', 'critical flaw', 'cannot be supported', 'not fundable'] },
];

/** 0 (worst) to 1 (best) for a value on a scale; undefined when unset. */
export function scaleGoodness(scale: ScaleDef, value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (scale.kind === 'numeric') {
    const t = (Number(value) - scale.min) / (scale.max - scale.min || 1);
    if (Number.isNaN(t)) return undefined;
    return Math.max(0, Math.min(1, scale.bestIsLow ? 1 - t : t));
  }
  const idx = scale.options.findIndex((o) => o.value === value);
  if (idx < 0) return undefined;
  return scale.options.length > 1 ? 1 - idx / (scale.options.length - 1) : 1;
}

/** The praise and concern vocabulary that matches a position on the scale. */
export function wordsFor(goodness: number): { praise: string[]; concern: string[]; band: string } {
  if (goodness >= 0.8) return { praise: PRAISE[3].words, concern: CONCERN[0].words, band: 'top' };
  if (goodness >= 0.6) return { praise: PRAISE[2].words, concern: [...CONCERN[0].words.slice(0, 3), ...CONCERN[1].words.slice(0, 3)], band: 'strong' };
  if (goodness >= 0.4) return { praise: PRAISE[1].words, concern: CONCERN[1].words, band: 'middle' };
  if (goodness >= 0.2) return { praise: PRAISE[0].words, concern: CONCERN[2].words, band: 'weak' };
  return { praise: PRAISE[0].words.slice(0, 2), concern: CONCERN[3].words, band: 'bottom' };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (rungs: Rung[]) =>
  rungs.map((r) => ({ level: r.level, re: new RegExp(`\\b(${r.words.map(escape).join('|')})\\b`, 'gi') }));
const PRAISE_RE = matcher(PRAISE);
const CONCERN_RE = matcher(CONCERN);

/** What the wording implies on the 0..1 axis, or undefined when there is too little evaluative language to say. */
export function impliedGoodness(text: string): number | undefined {
  if (!text.trim()) return undefined;
  let praise = 0;
  let concern = 0;
  let hits = 0;
  // Concern first, strongest rung first: "not credible" must not count as "credible", and
  // "significant weakness" must not also count as "weakness".
  let rest = text;
  for (const { level, re } of [...CONCERN_RE].reverse()) {
    rest = rest.replace(re, () => {
      concern += level;
      hits += 1;
      return ' ';
    });
  }
  for (const { level, re } of [...PRAISE_RE].reverse()) {
    rest = rest.replace(re, () => {
      praise += level;
      hits += 1;
      return ' ';
    });
  }
  if (hits < 2) return undefined;
  const total = praise + concern;
  return total ? praise / total : undefined;
}

export interface Calibration {
  /** 'stronger' when the words read better than the score, 'weaker' when they read worse. */
  direction: 'stronger' | 'weaker';
  message: string;
}

/** A mismatch between a rationale's wording and its score, when the gap is wide enough to matter. */
export function calibration(text: string, scale: ScaleDef, score: number | string | undefined, label = 'this score'): Calibration | null {
  const goodness = scaleGoodness(scale, score);
  const implied = impliedGoodness(text);
  if (goodness === undefined || implied === undefined) return null;
  const gap = implied - goodness;
  if (Math.abs(gap) < 0.4) return null;
  const direction = gap > 0 ? 'stronger' : 'weaker';
  const words = wordsFor(goodness);
  return {
    direction,
    message:
      direction === 'stronger'
        ? `The wording reads more favourably than ${label}. Either the score is generous or the concerns need naming; words that fit: ${words.concern.slice(0, 3).join(', ')}.`
        : `The wording reads harsher than ${label}. Either the score is generous to the applicant or the strengths need naming; words that fit: ${words.praise.slice(0, 3).join(', ')}.`,
  };
}

/**
 * Writing lints for a critique: specificity, contradiction, repetition, filler, blanks
 * left from the phrasebook, and language that belongs to the panel rather than the
 * applicant. Each lint returns a short, actionable message or nothing.
 */

import { CONCERN, PRAISE } from './intensity';

export interface Lint {
  id: string;
  text: string;
}

const EVALUATIVE = new RegExp(`\\b(${[...PRAISE, ...CONCERN].flatMap((r) => r.words).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
const PAGE_REF = /\bp(?:p|age)?\.?\s?\d+\b|\(p\. \d+/i;
const QUOTE = /[“"][^”"]{8,}[”"]/;

const OPPOSITES: [string, RegExp, string, RegExp][] = [
  ['innovative', /\b(innovative|novel|original)\b/i, 'incremental', /\b(incremental|confirmatory|derivative|not novel)\b/i],
  ['feasible', /(?<!not )(?<!in)\bfeasible\b/i, 'not feasible', /\b(not feasible|infeasible|unrealistic)\b/i],
  ['rigorous', /(?<!not )\brigorous\b/i, 'not rigorous', /\b(not rigorous|lacks rigou?r|poorly controlled)\b/i],
  ['clear', /(?<!un)(?<!not )\bclear(ly)?\b/i, 'unclear', /\b(unclear|confusing|vague)\b/i],
  ['well justified', /\bwell[- ]justified\b/i, 'not justified', /\b(not justified|unjustified|no justification)\b/i],
];

const FILLER: [RegExp, string][] = [
  [/\b(may|might|could)\s+(potentially|possibly|perhaps)\b/i, 'hedges stacked ("may potentially")'],
  [/\bit (should|must) be noted that\b/i, '"it should be noted that"'],
  [/\bit is (important|worth) (to note|noting) that\b/i, '"it is important to note that"'],
  [/\bin order to\b/i, '"in order to" (just "to")'],
  [/\bvery (very|much|unique)\b/i, '"very very"'],
  [/\bthe fact that\b/i, '"the fact that"'],
];

const PANEL_ONLY = /\b(the panel|study section|\bSAB\b|triage[d]?|discuss(ed|ion)? at the meeting|I (would|will) (score|give)|score[sd]? (of|a) \d|fundable range|not fundable|priority score)\b/i;

const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z“"(])/).map((s) => s.trim()).filter(Boolean);
const words = (s: string) => (s.match(/\S+/g) ?? []).length;

/** Lints for one criterion's rationale, given whether it has tagged evidence. */
export function lintRationale(text: string, opts: { hasEvidence: boolean; label: string }): Lint[] {
  const out: Lint[] = [];
  if (!text.trim()) return out;
  if (/\{[^}]*\}/.test(text)) out.push({ id: 'blank', text: `${opts.label}: fill in the blanks left in braces` });
  if (EVALUATIVE.test(text) && !PAGE_REF.test(text) && !QUOTE.test(text) && !opts.hasEvidence)
    out.push({ id: 'specific', text: `${opts.label}: point to a page or tag the passage the judgement rests on` });
  for (const [a, ra, b, rb] of OPPOSITES) {
    if (ra.test(text) && rb.test(text)) out.push({ id: `contra-${a}`, text: `${opts.label}: says both "${a}" and "${b}"; make the weighing explicit` });
  }
  const long = sentences(text).filter((s) => words(s) > 45);
  if (long.length) out.push({ id: 'long', text: `${opts.label}: ${long.length === 1 ? 'a sentence runs' : `${long.length} sentences run`} past 45 words; split` });
  for (const [re, what] of FILLER) if (re.test(text)) out.push({ id: `filler-${what.slice(1, 8)}`, text: `${opts.label}: trim ${what}` });
  return out;
}

/** A stock phrase (five or more words) repeated across boxes reads as boilerplate. */
export function repeatedPhrases(texts: Record<string, string>): Lint[] {
  const seen = new Map<string, Set<string>>();
  for (const [label, text] of Object.entries(texts)) {
    const toks = (text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []).filter((w) => w.length > 1);
    for (let i = 0; i + 5 <= toks.length; i++) {
      const gram = toks.slice(i, i + 5).join(' ');
      const set = seen.get(gram) ?? new Set<string>();
      set.add(label);
      seen.set(gram, set);
    }
  }
  const out: Lint[] = [];
  const reported = new Set<string>();
  for (const [gram, labels] of seen) {
    if (labels.size < 2) continue;
    const key = [...labels].sort().join('|');
    if (reported.has(key)) continue;
    reported.add(key);
    out.push({ id: `repeat-${out.length}`, text: `"${gram}…" appears in both ${[...labels].join(' and ')}; vary the wording or say it once` });
  }
  return out;
}

/** Feedback meant for the applicant should not talk about the panel's process. */
export function lintApplicantFacing(text: string, label: string): Lint[] {
  const m = text.match(PANEL_ONLY);
  return m ? [{ id: 'panel-only', text: `${label} mentions the panel's process ("${m[0]}"); keep it about the science` }] : [];
}

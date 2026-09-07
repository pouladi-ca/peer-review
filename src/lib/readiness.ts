import { criterionScale, fieldSpec, recommendationSpec, scoreLabel, type Framework } from './frameworks';
import { composeDraft, sectionPlainText } from './draft';
import { calibration } from './writing/intensity';
import type { PanelTab } from './store';
import type { Review } from './types';

export interface ScorecardRow {
  id: string;
  name: string;
  short: string;
  scoreValue?: number | string;
  scoreText: string;
  scored: boolean;
  /** True when the funder wants comments only for this criterion; "scored" then means "commented". */
  unscored: boolean;
  strengths: number;
  weaknesses: number;
  questions: number;
  hasRationale: boolean;
  /** Position of this score on a 0..1 goodness axis, for a heat swatch. */
  goodness?: number;
}

export interface ReadinessItem {
  id: string;
  kind: 'blocker' | 'suggestion';
  text: string;
  tab: PanelTab;
}

export interface Readiness {
  rows: ScorecardRow[];
  blockers: ReadinessItem[];
  suggestions: ReadinessItem[];
  ready: boolean;
}

function goodnessOf(fw: Framework, criterionId: string, value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const c = fw.criteria.find((x) => x.id === criterionId);
  const scale = c ? criterionScale(fw, c) : fw.overall.scale;
  if (scale.kind === 'numeric') {
    const t = (Number(value) - scale.min) / (scale.max - scale.min || 1);
    return scale.bestIsLow ? 1 - t : t;
  }
  const idx = scale.options.findIndex((o) => o.value === value);
  if (idx < 0) return undefined;
  // First option is best in every categorical scale we ship.
  return scale.options.length > 1 ? 1 - idx / (scale.options.length - 1) : 1;
}

/**
 * Consolidated readiness: a per-criterion scorecard plus blockers (things that
 * must be done before the review is complete) and suggestions (things that make
 * it more thorough, balanced, and useful to the applicant).
 */
export function computeReadiness(review: Review, fw: Framework): Readiness {
  const core = fw.criteria.filter((c) => c.group === 'core');
  const notesFor = (id: string) => review.annotations.filter((a) => a.criterionId === id);

  const rows: ScorecardRow[] = core.map((c) => {
    const s = review.scores[c.id];
    const scale = criterionScale(fw, c);
    const notes = notesFor(c.id);
    const unscored = !!c.unscored;
    const commented = (s?.comment?.trim().length ?? 0) > 0;
    const scored = unscored ? commented : s?.score !== undefined && s?.score !== '';
    return {
      id: c.id,
      name: c.name,
      short: c.short,
      scoreValue: unscored ? undefined : s?.score,
      scoreText: unscored ? (commented ? 'Commented' : '') : scored ? scoreLabel(scale, s?.score) : '',
      scored,
      unscored,
      strengths: notes.filter((a) => a.kind === 'strength').length,
      weaknesses: notes.filter((a) => a.kind === 'weakness').length,
      questions: notes.filter((a) => a.kind === 'question').length,
      hasRationale: (s?.comment?.trim().length ?? 0) >= 15,
      goodness: unscored ? undefined : goodnessOf(fw, c.id, s?.score),
    };
  });

  const blockers: ReadinessItem[] = [];
  const suggestions: ReadinessItem[] = [];

  for (const row of rows) {
    if (!row.scored) blockers.push({ id: `score-${row.id}`, kind: 'blocker', text: row.unscored ? `Comment on ${row.short}` : `Score ${row.short}`, tab: 'score' });
    else if (!row.hasRationale && row.strengths + row.weaknesses + row.questions === 0)
      suggestions.push({ id: `arg-${row.id}`, kind: 'suggestion', text: `Add a rationale or tag evidence for ${row.short}`, tab: 'score' });
  }

  const summarySpec = fieldSpec(fw, 'summary');
  const additionalSpec = fieldSpec(fw, 'additional');
  const overallSpec = fieldSpec(fw, 'overallComment');
  const recSpec = recommendationSpec(fw);

  if (review.overall.score === undefined || review.overall.score === '') blockers.push({ id: 'overall-score', kind: 'blocker', text: `Give an ${fw.overall.label.toLowerCase()}`, tab: 'score' });
  if (review.overall.comment.trim().length < 20) blockers.push({ id: 'overall-rationale', kind: 'blocker', text: `Write the ${overallSpec.label.toLowerCase()}`, tab: 'score' });
  if (recSpec.required && fw.recommendations?.length && !review.overall.recommendation)
    blockers.push({ id: 'recommendation', kind: 'blocker', text: `Answer “${recSpec.label}”`, tab: 'score' });
  if (summarySpec.required && review.draft.summary.trim().length === 0) blockers.push({ id: 'summary-required', kind: 'blocker', text: `Write the ${summarySpec.label.toLowerCase()} box`, tab: 'draft' });
  if (additionalSpec.required && review.draft.additional.trim().length === 0) blockers.push({ id: 'additional-required', kind: 'blocker', text: `Fill in the ${additionalSpec.label.toLowerCase()} box`, tab: 'draft' });

  // The funder's character limits: the form rejects anything longer, so these block.
  const draft = composeDraft(review, fw);
  const overBy = (text: string, max: number | undefined) => (max && text.length > max ? text.length - max : 0);
  const overLimit = (id: string, label: string, over: number, max: number, tab: PanelTab) => {
    if (over > 0) blockers.push({ id: `over-${id}`, kind: 'blocker', text: `${label} is ${over.toLocaleString()} character${over === 1 ? '' : 's'} over the ${max.toLocaleString()} limit`, tab });
  };
  for (const s of draft.sections) if (s.maxChars) overLimit(s.id, s.heading, overBy(sectionPlainText(s), s.maxChars), s.maxChars, 'score');
  if (summarySpec.maxChars) overLimit('summary', summarySpec.label, overBy(review.draft.summary, summarySpec.maxChars), summarySpec.maxChars, 'draft');
  if (additionalSpec.maxChars) overLimit('additional', additionalSpec.label, overBy(review.draft.additional, additionalSpec.maxChars), additionalSpec.maxChars, 'draft');
  if (overallSpec.maxChars) overLimit('overall', overallSpec.label, overBy(review.overall.comment, overallSpec.maxChars), overallSpec.maxChars, 'score');

  // Wording whose intensity contradicts the score it sits next to.
  for (const c of core) {
    if (c.unscored) continue;
    const s = review.scores[c.id];
    const cal = s?.comment ? calibration(s.comment, criterionScale(fw, c), s.score, 'its score') : null;
    if (cal) suggestions.push({ id: `cal-${c.id}`, kind: 'suggestion', text: `${c.short}: the wording reads ${cal.direction} than its score`, tab: 'score' });
  }
  {
    const cal = review.overall.comment ? calibration(review.overall.comment, fw.overall.scale, review.overall.score, 'the overall score') : null;
    if (cal) suggestions.push({ id: 'cal-overall', kind: 'suggestion', text: `The overall rationale reads ${cal.direction} than the score`, tab: 'score' });
  }

  // Balance and constructiveness nudges.
  for (const row of rows) {
    if (row.weaknesses > 0 && row.strengths === 0)
      suggestions.push({ id: `balance-${row.id}`, kind: 'suggestion', text: `Note any strengths of ${row.short} for a balanced critique`, tab: 'notes' });
  }
  const majorNoFix = review.annotations.filter((a) => a.kind === 'weakness' && a.severity === 'major' && a.comment.trim().length < 10);
  if (majorNoFix.length) suggestions.push({ id: 'major-fix', kind: 'suggestion', text: `Explain the problem and a possible fix for ${majorNoFix.length} major weakness${majorNoFix.length === 1 ? '' : 'es'}`, tab: 'notes' });

  if (review.draft.summary.trim().length < 40 && !blockers.some((b) => b.id === 'summary-required')) suggestions.push({ id: 'summary', kind: 'suggestion', text: 'Write a short summary of the application', tab: 'draft' });

  const coi = review.checklist['r-coi']?.state ?? 'unset';
  if (coi === 'unset') suggestions.push({ id: 'coi', kind: 'suggestion', text: 'Confirm you have no conflict of interest', tab: 'checklist' });

  const unresolved = fw.checklist.filter((c) => c.category !== 'reviewer' && (review.checklist[c.id]?.state ?? 'unset') === 'unset').length;
  if (unresolved > 0) suggestions.push({ id: 'checklist', kind: 'suggestion', text: `Resolve ${unresolved} remaining checklist item${unresolved === 1 ? '' : 's'}`, tab: 'checklist' });

  return { rows, blockers, suggestions, ready: blockers.length === 0 };
}

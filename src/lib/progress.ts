import type { Framework } from './frameworks';
import type { Review } from './types';

export interface ProgressPart {
  id: string;
  label: string;
  done: number;
  total: number;
  weight: number;
}

export interface Progress {
  percent: number;
  parts: ProgressPart[];
  nextStep: string;
}

export function computeProgress(review: Review, fw: Framework): Progress {
  const core = fw.criteria.filter((c) => c.group === 'core');
  const scored = core.filter((c) => review.scores[c.id]?.score !== undefined && review.scores[c.id]?.score !== '').length;
  const argued = core.filter((c) => {
    const s = review.scores[c.id];
    const linked = review.annotations.some((a) => a.criterionId === c.id);
    return (s?.comment?.trim().length ?? 0) >= 20 || linked;
  }).length;
  const overallDone = review.overall.score !== undefined && review.overall.score !== '' ? 1 : 0;
  const overallArgued = review.overall.comment.trim().length >= 20 ? 1 : 0;
  const checks = fw.checklist;
  const checked = checks.filter((c) => (review.checklist[c.id]?.state ?? 'unset') !== 'unset').length;
  const totalPages = review.docs.filter((d) => d.role === 'application').reduce((a, d) => a + d.pages, 0) || review.docs.reduce((a, d) => a + d.pages, 0);
  const visited = review.docs
    .filter((d) => (review.docs.some((x) => x.role === 'application') ? d.role === 'application' : true))
    .reduce((a, d) => a + (review.visited[d.id]?.length ?? 0), 0);
  const summary = review.draft.summary.trim().length >= 40 ? 1 : 0;

  const parts: ProgressPart[] = [
    { id: 'read', label: 'Pages read', done: Math.min(visited, totalPages), total: Math.max(totalPages, 1), weight: 20 },
    { id: 'scored', label: 'Criteria scored', done: scored, total: core.length, weight: 25 },
    { id: 'argued', label: 'Criteria with evidence', done: argued, total: core.length, weight: 20 },
    { id: 'overall', label: 'Overall rating and rationale', done: overallDone + overallArgued, total: 2, weight: 15 },
    { id: 'checklist', label: 'Checklist resolved', done: checked, total: checks.length, weight: 15 },
    { id: 'summary', label: 'Summary written', done: summary, total: 1, weight: 5 },
  ];
  const percent = Math.round(parts.reduce((acc, p) => acc + (p.total ? (p.done / p.total) * p.weight : 0), 0));

  let nextStep = 'Export your review.';
  const first = parts.find((p) => p.done < p.total);
  if (first) {
    nextStep =
      {
        read: `Read the remaining ${first.total - first.done} page${first.total - first.done === 1 ? '' : 's'}.`,
        scored: 'Score each core criterion in the Score tab.',
        argued: 'Add evidence: tag strengths and weaknesses for every criterion.',
        overall: 'Give an overall rating with a rationale.',
        checklist: 'Resolve the remaining checklist items.',
        summary: 'Write a short summary of the application in the Draft tab.',
      }[first.id] ?? nextStep;
  }
  return { percent, parts, nextStep };
}

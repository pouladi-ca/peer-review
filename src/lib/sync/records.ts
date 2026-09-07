/**
 * The record model: a Review is decomposed into independently mergeable records so two
 * devices can edit different parts at once without clobbering each other. Each key
 * merges last-writer-wins on its own, except `visited:*`, which is a set and merges as a
 * union, and `active:*`, which is per device and sums.
 */
import type { Annotation, ChecklistEntry, CriterionScore, DocMeta, QuickFacts, Review } from '../types';

export interface RecordChange {
  key: string;
  data: unknown;
  deleted: boolean;
}

const stable = (v: unknown): string => JSON.stringify(v);

/** Every record a review currently consists of. */
export function reviewToRecords(r: Review): Map<string, unknown> {
  const m = new Map<string, unknown>();
  m.set('meta', { title: r.title, frameworkId: r.frameworkId, createdAt: r.createdAt, focusCriterionId: r.focusCriterionId ?? null });
  m.set('facts', r.facts);
  m.set('draft:summary', r.draft.summary);
  m.set('draft:additional', r.draft.additional);
  m.set('draft:confidential', r.draft.confidential);
  m.set('overall', r.overall);
  if (r.panel) m.set('panel', r.panel);
  for (const [id, s] of Object.entries(r.scores)) m.set(`score:${id}`, s);
  for (const [id, c] of Object.entries(r.checklist)) m.set(`check:${id}`, c);
  for (const a of r.annotations) m.set(`ann:${a.id}`, a);
  for (const d of r.docs) m.set(`doc:${d.id}`, d);
  for (const [docId, pages] of Object.entries(r.visited)) m.set(`visited:${docId}`, [...pages].sort((a, b) => a - b));
  for (const [docId, page] of Object.entries(r.lastPage)) m.set(`lastpage:${docId}`, page);
  for (const [device, ms] of Object.entries(r.activeByDevice ?? {})) m.set(`active:${device}`, ms);
  return m;
}

/** Records whose value changed between two versions, including deletions. */
export function diffRecords(prev: Review | null, next: Review): RecordChange[] {
  const before = prev ? reviewToRecords(prev) : new Map<string, unknown>();
  const after = reviewToRecords(next);
  const out: RecordChange[] = [];
  for (const [key, data] of after) {
    if (!before.has(key) || stable(before.get(key)) !== stable(data)) out.push({ key, data, deleted: false });
  }
  for (const key of before.keys()) if (!after.has(key)) out.push({ key, data: null, deleted: true });
  return out;
}

/** Apply one record to a review draft (mutating; use inside immer). */
/**
 * Whether a record pulled from the server should overwrite what this device holds.
 * Merge keys (visited pages, active time) always combine. Anything else applies only when
 * strictly newer: an equal timestamp is this device's own write echoed back, and applying
 * it would revert keystrokes typed since it was pushed.
 */
export function shouldApply(key: string, remoteTs: number, localTs: number | undefined): boolean {
  if (isMergeKey(key)) return true;
  return remoteTs > (localTs ?? 0);
}

export function applyRecord(r: Review, key: string, data: unknown, deleted: boolean): void {
  const [kind, id] = splitKey(key);
  switch (kind) {
    case 'meta': {
      if (deleted) return;
      const m = data as { title?: string; frameworkId?: string; createdAt?: number; focusCriterionId?: string | null };
      if (typeof m.title === 'string') r.title = m.title;
      if (typeof m.frameworkId === 'string') r.frameworkId = m.frameworkId;
      if (typeof m.createdAt === 'number') r.createdAt = m.createdAt;
      r.focusCriterionId = m.focusCriterionId ?? undefined;
      return;
    }
    case 'facts':
      if (!deleted && data && typeof data === 'object') r.facts = data as Partial<QuickFacts>;
      return;
    case 'draft':
      if (deleted) return;
      if (id === 'summary' || id === 'additional' || id === 'confidential') r.draft[id] = typeof data === 'string' ? data : '';
      return;
    case 'overall':
      if (!deleted && data && typeof data === 'object') r.overall = data as Review['overall'];
      return;
    case 'panel':
      if (!deleted && data && typeof data === 'object') r.panel = data as Review['panel'];
      return;
    case 'score':
      if (deleted) delete r.scores[id];
      else r.scores[id] = data as CriterionScore;
      return;
    case 'check':
      if (deleted) delete r.checklist[id];
      else r.checklist[id] = data as ChecklistEntry;
      return;
    case 'ann': {
      const idx = r.annotations.findIndex((a) => a.id === id);
      if (deleted) {
        if (idx >= 0) r.annotations.splice(idx, 1);
      } else if (idx >= 0) r.annotations[idx] = data as Annotation;
      else r.annotations.push(data as Annotation);
      return;
    }
    case 'doc': {
      const idx = r.docs.findIndex((d) => d.id === id);
      if (deleted) {
        if (idx >= 0) r.docs.splice(idx, 1);
      } else if (idx >= 0) r.docs[idx] = data as DocMeta;
      else r.docs.push(data as DocMeta);
      return;
    }
    case 'visited': {
      if (deleted) return;
      const incoming = Array.isArray(data) ? (data as number[]) : [];
      const merged = new Set([...(r.visited[id] ?? []), ...incoming]);
      r.visited[id] = [...merged].sort((a, b) => a - b);
      return;
    }
    case 'lastpage':
      if (!deleted && typeof data === 'number') r.lastPage[id] = data;
      return;
    case 'active':
      if (!deleted && typeof data === 'number') {
        r.activeByDevice = { ...(r.activeByDevice ?? {}), [id]: data };
        r.activeMs = Object.values(r.activeByDevice).reduce((a, b) => a + b, 0);
      }
      return;
    default:
      return;
  }
}

export function splitKey(key: string): [string, string] {
  const i = key.indexOf(':');
  return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)];
}

/** Keys that merge by union or sum rather than last-writer-wins. */
export function isMergeKey(key: string): boolean {
  return key.startsWith('visited:');
}

/** Shared domain types for Panelist. */

export type NoteKind = 'strength' | 'weakness' | 'question' | 'note';
export type Severity = 'major' | 'minor';

/** Rectangle normalised to the unrotated page: all values in 0..1. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Annotation {
  id: string;
  docId: string;
  page: number; // 1-based
  rects: Rect[];
  quote: string;
  kind: NoteKind;
  criterionId?: string;
  severity?: Severity;
  comment: string;
  createdAt: number;
  updatedAt: number;
  /** Position in the reflowed reading view, when the note was made there. */
  anchor?: { startBlock: string; startOff: number; endBlock: string; endOff: number };
}

export type DocRole = 'application' | 'supporting' | 'guidance';

export interface DocMeta {
  id: string;
  name: string;
  size: number;
  pages: number;
  addedAt: number;
  role: DocRole;
}

export interface CriterionScore {
  score?: number | string;
  comment: string;
}

export type CheckState = 'unset' | 'yes' | 'no' | 'na';

export interface ChecklistEntry {
  state: CheckState;
  note: string;
}

export interface QuickFacts {
  title?: string;
  pi?: string;
  institution?: string;
  mechanism?: string;
  budget?: string;
  duration?: string;
  aims?: string[];
  keyTerms?: string[];
  words?: number;
  figures?: number;
  tables?: number;
  references?: number;
}

export interface Review {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  frameworkId: string;
  docs: DocMeta[];
  annotations: Annotation[];
  scores: Record<string, CriterionScore>;
  overall: { score?: number | string; comment: string; recommendation?: string };
  checklist: Record<string, ChecklistEntry>;
  draft: { summary: string; additional: string; confidential: string };
  facts: Partial<QuickFacts>;
  visited: Record<string, number[]>;
  lastPage: Record<string, number>;
  /** Total active time across devices (derived from activeByDevice when syncing). */
  activeMs: number;
  /** Active time per device id, so devices add rather than overwrite. */
  activeByDevice?: Record<string, number>;
  /** Criterion the reviewer is currently focusing on; new notes default to it. */
  focusCriterionId?: string;
  /** Talking points and the discussion log for the panel meeting. */
  panel?: PanelNotes;
  /** Set when the review is archived: out of the way, not deleted. */
  archivedAt?: number;
  /** The funder's deadline for this review, as a local calendar date (YYYY-MM-DD). */
  dueDate?: string;
}

export interface DiscussionEntry {
  id: string;
  at: number;
  /** Who said it: "Me", "R2", "Chair", and so on. */
  who: string;
  text: string;
}

export interface PanelNotes {
  /** The two-sentence oral summary to open with. */
  pitch: string;
  /** Questions for the other reviewers or the program. */
  ask: string;
  log: DiscussionEntry[];
  /** The score after discussion, when it changed. */
  finalScore?: number | string;
  finalReason?: string;
}

/** A positioned run of text on a page, normalised like Rect. */
export interface TextRun extends Rect {
  str: string;
  size: number; // font size in PDF units
  /** Index into PageText.lines. */
  line: number;
}

export interface PageText {
  page: number;
  width: number; // points at scale 1
  height: number;
  text: string; // plain text with line breaks
  lines: TextLine[];
  runs: TextRun[];
}

export interface TextLine {
  text: string;
  size: number; // dominant font size
  y: number; // normalised top
  x: number; // normalised left
  page: number;
}

export interface OutlineEntry {
  id: string;
  title: string;
  page: number;
  y: number;
  level: 1 | 2;
  /** Criterion this section most plausibly speaks to. */
  criterionHint?: string;
}

export interface EvidenceHit {
  page: number;
  snippet: string;
  rect?: Rect;
}

export interface SearchHit {
  docId: string;
  page: number;
  snippet: string;
  rect: Rect;
}

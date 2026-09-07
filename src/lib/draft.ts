import { criterionScale, fieldSpec, recommendationSpec, scoreLabel, type Criterion, type Framework } from './frameworks';
import type { Annotation, DocMeta, Review } from './types';

export interface DraftBullet {
  text: string;
  page?: number;
  docName?: string;
  severity?: 'major' | 'minor';
  quote?: string;
  noteId: string;
}

export interface DraftSection {
  id: string;
  heading: string;
  scoreLine?: string;
  body: string;
  strengths: DraftBullet[];
  weaknesses: DraftBullet[];
  questions: DraftBullet[];
  notes: DraftBullet[];
  empty: boolean;
  /** The funder's character limit for this box, if any. */
  maxChars?: number;
  /** What the framework asks under this criterion, for the optional guidance export. */
  guide?: { description: string; prompts: string[] };
}

export interface Draft {
  title: string;
  frameworkName: string;
  generatedAt: number;
  summary: string;
  sections: DraftSection[];
  additional: { heading: string; line: string }[];
  overall: { heading: string; scoreLine: string; body: string; bodyLabel: string; recommendation?: string; recommendationLabel: string };
  questions: DraftBullet[];
  additionalComments: string;
  confidential: string;
  /** Headings of the free-text boxes, as the funder names them. */
  labels: { summary: string; additional: string };
  /** Character limits of the free-text boxes, when the funder sets them. */
  limits: { summary?: number; additional?: number; overallComment?: number };
  /** The framework's own words, exported only when the reviewer asks for them. */
  guide: { agency: string; about: string; overall: string; scaleHint?: string; guidance: string[] };
  stats: { strengths: number; weaknesses: number; questions: number; notes: number; major: number };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function pageRef(a: Annotation, docs: DocMeta[], multiDoc: boolean): string {
  const doc = docs.find((d) => d.id === a.docId);
  return multiDoc && doc ? `${clip(doc.name.replace(/\.pdf$/i, ''), 24)}, p. ${a.page}` : `p. ${a.page}`;
}

/** How the draft is composed; `fullQuotes` reproduces every highlighted passage whole instead of clipping it. */
export interface ComposeOptions {
  fullQuotes?: boolean;
}

export function bulletText(b: DraftBullet, ref: string, fullQuotes = false): string {
  const sev = b.severity === 'major' ? 'Major: ' : b.severity === 'minor' ? 'Minor: ' : '';
  const q = (n: number) => (fullQuotes ? (b.quote ?? '').trim() : clip(b.quote ?? '', n));
  if (b.text && b.quote) return `${sev}${b.text} (“${q(140)}”, ${ref})`;
  if (b.text) return `${sev}${b.text} (${ref})`;
  return `${sev}“${q(200)}” (${ref})`;
}

function toBullet(a: Annotation, docs: DocMeta[], multiDoc: boolean): DraftBullet & { ref: string } {
  return { text: a.comment.trim(), quote: a.quote.trim(), page: a.page, severity: a.severity, noteId: a.id, ref: pageRef(a, docs, multiDoc) };
}

function sortNotes(list: Annotation[]): Annotation[] {
  return [...list].sort((a, b) => {
    const s = (x: Annotation) => (x.severity === 'major' ? 0 : x.severity === 'minor' ? 2 : 1);
    return s(a) - s(b) || a.page - b.page || a.createdAt - b.createdAt;
  });
}

export function autoSummary(review: Review): string {
  const f = review.facts;
  const bits: string[] = [];
  if (f.title) bits.push(`This application, “${f.title}”${f.pi ? ` from ${f.pi}` : ''}${f.institution ? ` (${f.institution})` : ''}, `);
  else bits.push('This application ');
  if (f.aims && f.aims.length) {
    bits.push(`proposes ${f.aims.length} aim${f.aims.length === 1 ? '' : 's'}: `);
    bits.push(f.aims.map((a) => a.replace(/^Aim \S+:\s*/, '').replace(/\.$/, '')).join('; ') + '.');
  } else {
    bits.push('proposes a programme of research summarised below.');
  }
  if (f.budget || f.duration) bits.push(` The request is ${[f.budget, f.duration ? `over ${f.duration}` : ''].filter(Boolean).join(' ')}.`);
  return bits.join('');
}

export function composeDraft(review: Review, fw: Framework, opts: ComposeOptions = {}): Draft {
  const full = !!opts.fullQuotes;
  const docs = review.docs;
  const multiDoc = docs.length > 1;
  const byCriterion = new Map<string | undefined, Annotation[]>();
  for (const a of review.annotations) {
    const key = fw.criteria.some((c) => c.id === a.criterionId) ? a.criterionId : undefined;
    byCriterion.set(key, [...(byCriterion.get(key) ?? []), a]);
  }

  const mkSection = (c: Criterion | undefined, heading: string, id: string): DraftSection => {
    const notes = sortNotes(byCriterion.get(c?.id) ?? []);
    const score = c ? review.scores[c.id] : undefined;
    const scale = c ? criterionScale(fw, c) : undefined;
    const label = c && scale ? scoreLabel(scale, score?.score) : '';
    const conv = (list: Annotation[]) => list.map((a) => toBullet(a, docs, multiDoc));
    const strengths = conv(notes.filter((n) => n.kind === 'strength'));
    const weaknesses = conv(notes.filter((n) => n.kind === 'weakness'));
    const questions = conv(notes.filter((n) => n.kind === 'question'));
    const other = conv(notes.filter((n) => n.kind === 'note'));
    const body = score?.comment?.trim() ?? '';
    return {
      id,
      heading,
      scoreLine: label && !c?.unscored ? `${scale?.kind === 'numeric' ? 'Score' : 'Rating'}: ${label}` : undefined,
      body,
      maxChars: c?.maxChars,
      guide: c ? { description: c.description, prompts: c.prompts } : undefined,
      strengths: strengths.map((b) => ({ ...b, text: bulletText(b, b.ref, full) })),
      weaknesses: weaknesses.map((b) => ({ ...b, text: bulletText(b, b.ref, full) })),
      questions: questions.map((b) => ({ ...b, text: bulletText(b, b.ref, full) })),
      notes: other.map((b) => ({ ...b, text: bulletText(b, b.ref, full) })),
      empty: !body && notes.length === 0 && !label,
    };
  };

  const core = fw.criteria.filter((c) => c.group === 'core');
  const sections = core.map((c) => mkSection(c, c.name, c.id));
  const general = mkSection(undefined, 'General comments', 'general');
  if (!general.empty) sections.push(general);

  const additional = fw.criteria
    .filter((c) => c.group === 'additional')
    .map((c) => {
      const s = review.scores[c.id];
      const label = scoreLabel(criterionScale(fw, c), s?.score);
      const notes = sortNotes(byCriterion.get(c.id) ?? []).map((a) => bulletText(toBullet(a, docs, multiDoc), pageRef(a, docs, multiDoc), full));
      const line = [label, s?.comment?.trim(), ...notes].filter(Boolean).join('. ').replace(/\.\./g, '.');
      return { heading: c.name, line };
    })
    .filter((x) => x.line);

  const overallLabel = scoreLabel(fw.overall.scale, review.overall.score);
  const summarySpec = fieldSpec(fw, 'summary');
  const additionalSpec = fieldSpec(fw, 'additional');
  const overallSpec = fieldSpec(fw, 'overallComment');
  const all = review.annotations;
  const questions = sortNotes(all.filter((a) => a.kind === 'question')).map((a) => {
    const b = toBullet(a, docs, multiDoc);
    return { ...b, text: bulletText(b, b.ref, full) };
  });

  return {
    title: review.title,
    frameworkName: fw.name,
    generatedAt: Date.now(),
    summary: review.draft.summary.trim() || autoSummary(review),
    sections,
    additional,
    overall: {
      heading: fw.overall.label,
      scoreLine: overallLabel ? `${fw.overall.scale.kind === 'numeric' ? 'Score' : 'Rating'}: ${overallLabel}` : '',
      body: review.overall.comment.trim(),
      bodyLabel: overallSpec.label,
      recommendation: review.overall.recommendation,
      recommendationLabel: recommendationSpec(fw).label,
    },
    questions,
    additionalComments: review.draft.additional.trim(),
    confidential: review.draft.confidential.trim(),
    labels: { summary: summarySpec.label, additional: additionalSpec.label },
    limits: { summary: summarySpec.maxChars, additional: additionalSpec.maxChars, overallComment: overallSpec.maxChars },
    guide: { agency: fw.agency, about: fw.blurb, overall: fw.overall.description, scaleHint: fw.overall.scale.kind === 'numeric' ? fw.overall.scale.hint : undefined, guidance: fw.guidance },
    stats: {
      strengths: all.filter((a) => a.kind === 'strength').length,
      weaknesses: all.filter((a) => a.kind === 'weakness').length,
      questions: all.filter((a) => a.kind === 'question').length,
      notes: all.filter((a) => a.kind === 'note').length,
      major: all.filter((a) => a.severity === 'major').length,
    },
  };
}

export interface ExportOptions {
  includeConfidential?: boolean;
  /** Also print what the framework asks under each heading, and the agency's guidance to reviewers. */
  includeGuidance?: boolean;
}

/** A blockquote with the framework's description and guiding questions for a heading. */
function guideLines(description: string, prompts: string[] = []): string[] {
  const out: string[] = [];
  if (description) out.push(`> ${description}`);
  for (const p of prompts) out.push(`> - ${p}`);
  if (out.length) out.push('');
  return out;
}

export function draftToMarkdown(d: Draft, opts: ExportOptions = {}): string {
  const out: string[] = [];
  out.push(`# Review: ${d.title}`);
  out.push(`*${d.frameworkName}. Drafted ${new Date(d.generatedAt).toLocaleDateString()}.*`, '');
  if (opts.includeGuidance && d.guide.about) out.push(...guideLines(`How ${d.guide.agency} reviews: ${d.guide.about}`));
  out.push(`## ${d.labels.summary}`, '', d.summary, '');
  for (const s of d.sections) {
    if (s.empty && !(opts.includeGuidance && s.guide)) continue;
    out.push(`## ${s.heading}`);
    if (opts.includeGuidance && s.guide) out.push(...guideLines(s.guide.description, s.guide.prompts));
    if (s.scoreLine) out.push(`**${s.scoreLine}**`, '');
    if (s.body) out.push(s.body, '');
    const block = (title: string, list: DraftBullet[]) => {
      if (!list.length) return;
      out.push(`**${title}**`, '');
      for (const b of list) out.push(`- ${b.text}`);
      out.push('');
    };
    block('Strengths', s.strengths);
    block('Weaknesses', s.weaknesses);
    block('Questions for the applicants', s.questions);
    block('Other comments', s.notes);
  }
  if (d.additional.length) {
    out.push('## Additional review criteria', '');
    for (const a of d.additional) out.push(`- **${a.heading}.** ${a.line}`);
    out.push('');
  }
  out.push(`## ${d.overall.heading}`);
  if (opts.includeGuidance) out.push(...guideLines([d.guide.overall, d.guide.scaleHint].filter(Boolean).join(' ')));
  if (d.overall.scoreLine) out.push(`**${d.overall.scoreLine}**`, '');
  if (d.overall.recommendation) out.push(`**${d.overall.recommendationLabel}** ${d.overall.recommendation}`, '');
  if (d.overall.body) out.push(d.overall.body, '');
  if (d.additionalComments) out.push(`## ${d.labels.additional}`, '', d.additionalComments, '');
  if (opts.includeConfidential && d.confidential) out.push('## Confidential comments to the program', '', d.confidential, '');
  if (opts.includeGuidance && d.guide.guidance.length) {
    out.push(`## ${d.guide.agency} guidance to reviewers`, '');
    for (const g of d.guide.guidance) out.push(`- ${g}`);
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function draftToPlainText(d: Draft, opts: ExportOptions = {}): string {
  return draftToMarkdown(d, opts)
    .replace(/^> - /gm, '    • ')
    .replace(/^> /gm, '    ')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\*(.+?)\*$/gm, '$1')
    .replace(/^- /gm, '• ');
}

/**
 * One criterion's box as plain text, ready to paste into the funder's form:
 * the rationale followed by the tagged strengths, weaknesses, and questions.
 */
export function sectionPlainText(s: DraftSection): string {
  const out: string[] = [];
  if (s.body) out.push(s.body);
  const block = (title: string, list: DraftBullet[]) => {
    if (!list.length) return;
    out.push([title, ...list.map((b) => `• ${b.text}`)].join('\n'));
  };
  block('Strengths', s.strengths);
  block('Weaknesses', s.weaknesses);
  block('Questions for the applicants', s.questions);
  block('Other comments', s.notes);
  return out.join('\n\n').trim();
}

import { criterionScale, scoreLabel, type Criterion, type Framework } from './frameworks';
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
}

export interface Draft {
  title: string;
  frameworkName: string;
  generatedAt: number;
  summary: string;
  sections: DraftSection[];
  additional: { heading: string; line: string }[];
  overall: { heading: string; scoreLine: string; body: string; recommendation?: string };
  questions: DraftBullet[];
  additionalComments: string;
  confidential: string;
  stats: { strengths: number; weaknesses: number; questions: number; notes: number; major: number };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function pageRef(a: Annotation, docs: DocMeta[], multiDoc: boolean): string {
  const doc = docs.find((d) => d.id === a.docId);
  return multiDoc && doc ? `${clip(doc.name.replace(/\.pdf$/i, ''), 24)}, p. ${a.page}` : `p. ${a.page}`;
}

export function bulletText(b: DraftBullet, ref: string): string {
  const sev = b.severity === 'major' ? 'Major: ' : b.severity === 'minor' ? 'Minor: ' : '';
  if (b.text && b.quote) return `${sev}${b.text} (“${clip(b.quote, 140)}”, ${ref})`;
  if (b.text) return `${sev}${b.text} (${ref})`;
  return `${sev}“${clip(b.quote ?? '', 200)}” (${ref})`;
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

export function composeDraft(review: Review, fw: Framework): Draft {
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
      scoreLine: label ? `${scale?.kind === 'numeric' ? 'Score' : 'Rating'}: ${label}` : undefined,
      body,
      strengths: strengths.map((b) => ({ ...b, text: bulletText(b, b.ref) })),
      weaknesses: weaknesses.map((b) => ({ ...b, text: bulletText(b, b.ref) })),
      questions: questions.map((b) => ({ ...b, text: bulletText(b, b.ref) })),
      notes: other.map((b) => ({ ...b, text: bulletText(b, b.ref) })),
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
      const notes = sortNotes(byCriterion.get(c.id) ?? []).map((a) => bulletText(toBullet(a, docs, multiDoc), pageRef(a, docs, multiDoc)));
      const line = [label, s?.comment?.trim(), ...notes].filter(Boolean).join('. ').replace(/\.\./g, '.');
      return { heading: c.name, line };
    })
    .filter((x) => x.line);

  const overallLabel = scoreLabel(fw.overall.scale, review.overall.score);
  const all = review.annotations;
  const questions = sortNotes(all.filter((a) => a.kind === 'question')).map((a) => {
    const b = toBullet(a, docs, multiDoc);
    return { ...b, text: bulletText(b, b.ref) };
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
      recommendation: review.overall.recommendation,
    },
    questions,
    additionalComments: review.draft.additional.trim(),
    confidential: review.draft.confidential.trim(),
    stats: {
      strengths: all.filter((a) => a.kind === 'strength').length,
      weaknesses: all.filter((a) => a.kind === 'weakness').length,
      questions: all.filter((a) => a.kind === 'question').length,
      notes: all.filter((a) => a.kind === 'note').length,
      major: all.filter((a) => a.severity === 'major').length,
    },
  };
}

export function draftToMarkdown(d: Draft, opts: { includeConfidential?: boolean } = {}): string {
  const out: string[] = [];
  out.push(`# Review: ${d.title}`);
  out.push(`*${d.frameworkName}. Drafted ${new Date(d.generatedAt).toLocaleDateString()}.*`, '');
  out.push('## Summary of the application', '', d.summary, '');
  for (const s of d.sections) {
    if (s.empty) continue;
    out.push(`## ${s.heading}`);
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
  if (d.overall.scoreLine) out.push(`**${d.overall.scoreLine}**`, '');
  if (d.overall.recommendation) out.push(`**Recommendation:** ${d.overall.recommendation}`, '');
  if (d.overall.body) out.push(d.overall.body, '');
  if (d.additionalComments) out.push('## Additional comments', '', d.additionalComments, '');
  if (opts.includeConfidential && d.confidential) out.push('## Confidential comments to the program', '', d.confidential, '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function draftToPlainText(d: Draft, opts: { includeConfidential?: boolean } = {}): string {
  return draftToMarkdown(d, opts)
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\*(.+?)\*$/gm, '$1')
    .replace(/^- /gm, '• ');
}

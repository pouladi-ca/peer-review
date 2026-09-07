/**
 * Turn tagged evidence into critique sentences. A note already holds a kind, a severity,
 * a quote, a page, and the reviewer's comment; the templates here arrange those parts
 * into the sentence a panel expects, so the draft reads as prose rather than a list.
 */

import type { Annotation, DocMeta } from '../types';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function sentenceCase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function lowerFirst(s: string): string {
  const t = s.trim();
  // Keep acronyms and proper-looking tokens as they are.
  return /^[A-Z]{2,}|^[A-Z][a-z]+\s[A-Z]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}

const stripEnd = (s: string) => s.replace(/[.\s]+$/, '');
const endStop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function ref(a: Annotation, docs: DocMeta[]): string {
  const multi = docs.length > 1;
  const doc = docs.find((d) => d.id === a.docId);
  return multi && doc ? `${clip(doc.name.replace(/\.pdf$/i, ''), 24)}, p. ${a.page}` : `p. ${a.page}`;
}

/** One sentence (or two) for a note. Never invents content: every clause comes from the note. */
export function sentenceFor(a: Annotation, docs: DocMeta[]): string {
  const comment = stripEnd(a.comment.trim());
  const quote = a.quote.trim();
  const where = ref(a, docs);
  const q = quote ? `“${clip(quote, 140)}”` : '';
  const cite = q ? `(${where}: ${q})` : `(${where})`;

  if (a.kind === 'strength') {
    if (comment) return endStop(`${sentenceCase(comment)} ${cite}`);
    return endStop(`A strength is the passage ${q} ${`(${where})`}`);
  }
  if (a.kind === 'weakness') {
    const major = a.severity === 'major';
    if (comment) {
      const lead = major ? 'A significant weakness is that' : a.severity === 'minor' ? 'A minor point:' : 'A weakness is that';
      const body = major || a.severity !== 'minor' ? lowerFirst(comment) : sentenceCase(comment);
      const tail = major ? ' Addressing this would strengthen the application.' : '';
      return `${endStop(`${lead} ${body} ${cite}`)}${tail}`;
    }
    return endStop(`${major ? 'A significant weakness concerns' : 'A weakness concerns'} the passage ${q} (${where})`);
  }
  if (a.kind === 'question') {
    if (comment) {
      const c = comment.replace(/\?$/, '');
      const starts = /^(how|why|whether|what|which|when|where|who)\b/i.test(c);
      return endStop(`It is unclear ${starts ? lowerFirst(c) : `whether ${lowerFirst(c)}`} ${cite}; the applicants should clarify this`);
    }
    return endStop(`The passage ${q} (${where}) raises a question the application does not answer`);
  }
  if (comment) return endStop(`${sentenceCase(comment)} ${cite}`);
  return endStop(`See ${q} (${where})`);
}

/** Sentences for the notes not already reflected in a rationale, grouped as strengths then weaknesses then questions. */
export function composeFromEvidence(notes: Annotation[], docs: DocMeta[], existing: string): string[] {
  const have = existing.toLowerCase();
  const fresh = notes.filter((n) => {
    const c = n.comment.trim().toLowerCase();
    const q = n.quote.trim().toLowerCase();
    if (c && c.length >= 12 && have.includes(c.slice(0, Math.min(40, c.length)))) return false;
    if (q && have.includes(clip(q, 60).toLowerCase().replace(/…$/, ''))) return false;
    return true;
  });
  const order = (k: Annotation['kind']) => (k === 'strength' ? 0 : k === 'weakness' ? 1 : k === 'question' ? 2 : 3);
  const sev = (n: Annotation) => (n.severity === 'major' ? 0 : n.severity === 'minor' ? 2 : 1);
  return [...fresh].sort((a, b) => order(a.kind) - order(b.kind) || sev(a) - sev(b) || a.page - b.page).map((n) => sentenceFor(n, docs));
}

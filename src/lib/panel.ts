/**
 * The panel card: what a reviewer needs in hand during the meeting. Everything here is
 * derived from the review; the reviewer edits the pitch and the questions, and the
 * discussion log records what was said and how the score moved.
 */

import { scoreLabel, type Framework } from './frameworks';
import type { Annotation, PanelNotes, Review } from './types';

/** Clip at a word boundary so a spoken pitch never ends mid-word. */
const clip = (s: string, n: number) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const at = cut.lastIndexOf(' ');
  return (at > n * 0.6 ? cut.slice(0, at) : cut).trimEnd() + '…';
};
const lowerFirst = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const stripEnd = (s: string) => s.trim().replace(/[.\s]+$/, '');

export const EMPTY_PANEL: PanelNotes = { pitch: '', ask: '', log: [] };

/** The notes that matter most for a kind: major first, then ones with a comment, then by page. */
export function topNotes(review: Review, kind: Annotation['kind'], n = 2): Annotation[] {
  const rank = (a: Annotation) => (a.severity === 'major' ? 0 : a.severity === 'minor' ? 2 : 1) * 10 + (a.comment.trim() ? 0 : 5);
  return review.annotations
    .filter((a) => a.kind === kind)
    .sort((a, b) => rank(a) - rank(b) || a.page - b.page)
    .slice(0, n);
}

/** One line for a note: the comment, or the quote when there is none, with its page. */
export function noteLine(a: Annotation): string {
  const body = stripEnd(a.comment) || `“${clip(a.quote.trim(), 100)}”`;
  return `${body} (p. ${a.page})`;
}

/** A two-sentence oral summary drafted from the facts, the score, and the top notes. */
export function draftPitch(review: Review, fw: Framework): string {
  const f = review.facts;
  const title = f.title && f.title.length <= 120 ? f.title : review.title;
  const who = f.pi ? ` from ${f.pi}` : '';
  const aims = (f.aims ?? []).map((a) => clip(a.replace(/^Aim \S+:\s*/, '').replace(/\.$/, ''), 70));
  const first = aims.length ? `“${clip(title, 90)}”${who} proposes ${aims.length} aim${aims.length === 1 ? '' : 's'}: ${aims.slice(0, 3).join('; ')}.` : `“${clip(title, 90)}”${who} proposes ${clip(review.draft.summary || 'the work summarised in my review', 120)}.`;
  const label = scoreLabel(fw.overall.scale, review.overall.score);
  const strength = topNotes(review, 'strength', 1)[0];
  const weakness = topNotes(review, 'weakness', 1)[0];
  const parts: string[] = [];
  if (strength) parts.push(`the main strength is ${lowerFirst(stripEnd(strength.comment) || `the passage on p. ${strength.page}`)}`);
  if (weakness) parts.push(`the main concern is ${lowerFirst(stripEnd(weakness.comment) || `the passage on p. ${weakness.page}`)}`);
  const second = `${label ? `I scored it ${label}` : 'I have not settled on a score yet'}${parts.length ? `: ${parts.join(', and ')}.` : '.'}`;
  return `${first} ${second}`;
}

/** Questions for the panel, drafted from the reviewer's question notes. */
export function draftAsk(review: Review): string {
  return review.annotations
    .filter((a) => a.kind === 'question')
    .sort((a, b) => a.page - b.page)
    .map((a) => `• ${noteLine(a)}`)
    .join('\n');
}

/** The whole card as plain text, for copying into a meeting note or a message to oneself. */
export function panelCardText(review: Review, fw: Framework): string {
  const p = review.panel ?? EMPTY_PANEL;
  const out: string[] = [review.title, ''];
  const label = scoreLabel(fw.overall.scale, review.overall.score);
  out.push(`My score: ${label || 'not set'}${review.overall.recommendation ? ` · ${review.overall.recommendation}` : ''}`);
  if (p.finalScore !== undefined && p.finalScore !== '') out.push(`After discussion: ${scoreLabel(fw.overall.scale, p.finalScore)}${p.finalReason ? ` (${p.finalReason})` : ''}`);
  out.push('', 'Pitch', p.pitch || draftPitch(review, fw), '');
  const s = topNotes(review, 'strength', 2);
  const w = topNotes(review, 'weakness', 2);
  if (s.length) out.push('Strengths', ...s.map((a) => `• ${noteLine(a)}`), '');
  if (w.length) out.push('Weaknesses', ...w.map((a) => `• ${noteLine(a)}`), '');
  const ask = p.ask || draftAsk(review);
  if (ask) out.push('Questions for the panel', ask, '');
  if (p.log.length) {
    out.push('Discussion');
    for (const e of p.log) out.push(`${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${e.who}: ${e.text}`);
  }
  return out.join('\n').trim();
}

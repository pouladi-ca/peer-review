/** Insert text into a controlled textarea at the caret, with sensible spacing, and select the first placeholder. */

import { placeholders } from './phrasebook';

export interface Insertion {
  value: string;
  /** Selection to apply after the value is rendered. */
  select: { start: number; end: number };
}

export function insertAtCaret(current: string, caretStart: number, caretEnd: number, text: string): Insertion {
  const start = Math.max(0, Math.min(caretStart, current.length));
  const end = Math.max(start, Math.min(caretEnd, current.length));
  const before = current.slice(0, start);
  const after = current.slice(end);
  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
  const piece = `${needsSpaceBefore ? ' ' : ''}${text}${needsSpaceAfter ? ' ' : ''}`;
  const value = before + piece + after;
  const offset = start + (needsSpaceBefore ? 1 : 0);
  const ph = placeholders(text)[0];
  const select = ph ? { start: offset + ph.start, end: offset + ph.end } : { start: offset + text.length, end: offset + text.length };
  return { value, select };
}

/** Append paragraphs at the end, separated by a blank line from what is there. */
export function appendParagraph(current: string, text: string): Insertion {
  const trimmed = current.replace(/\s+$/, '');
  const value = trimmed ? `${trimmed}\n\n${text}` : text;
  return { value, select: { start: value.length, end: value.length } };
}

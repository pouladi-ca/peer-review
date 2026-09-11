export function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${m} min`;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function plural(n: number, word: string, pl = word + 's'): string {
  return `${n} ${n === 1 ? word : pl}`;
}

export function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const mod = isMac ? '⌘' : 'Ctrl';

/** What an in-progress document import is doing, for the strip and the Brief panel. */
export function readingLabel(doc: { pdf?: { numPages: number }; progress: number; message?: string }): string {
  if (doc.message) return doc.message;
  const total = doc.pdf?.numPages ?? 0;
  if (!total) return 'Opening the PDF';
  return `Reading page ${Math.max(1, Math.round(doc.progress * total))} of ${total}`;
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from today to a YYYY-MM-DD date, negative when past. */
export function daysUntil(dueDate: string, now = new Date()): number {
  const [y, m, d] = dueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** "Due today", "Due in 3 days", "Due 15 Oct", or "Overdue by 2 days", with an urgency level for styling. */
export function dueLabel(dueDate: string, now = new Date()): { text: string; level: 'overdue' | 'soon' | 'later' } {
  const days = daysUntil(dueDate, now);
  if (days < 0) return { text: `Overdue by ${plural(-days, 'day')}`, level: 'overdue' };
  if (days === 0) return { text: 'Due today', level: 'soon' };
  if (days === 1) return { text: 'Due tomorrow', level: 'soon' };
  if (days <= 7) return { text: `Due in ${days} days`, level: 'soon' };
  const [y, m, d] = dueDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = date.getFullYear() === now.getFullYear();
  return { text: `Due ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}`, level: 'later' };
}

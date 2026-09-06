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

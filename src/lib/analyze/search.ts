import type { PageText, SearchHit } from '../types';
import { rectForOffset, snippetAround } from './checklist';

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchPages(docId: string, pages: PageText[], query: string, limit = 200): SearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const rx = new RegExp(escapeRx(q).replace(/\s+/g, '\\s+'), 'gi');
  const hits: SearchHit[] = [];
  for (const page of pages) {
    for (const m of page.text.matchAll(rx)) {
      const idx = m.index ?? 0;
      const rect = rectForOffset(page, idx, m[0].length);
      if (!rect) continue;
      hits.push({ docId, page: page.page, snippet: snippetAround(page.text, idx, m[0].length, 40), rect });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

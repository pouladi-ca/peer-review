import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { extractTerms, type Term } from '../lib/writing/vocab';
import type { PageText } from '../lib/types';

const cache = new WeakMap<PageText[], Term[]>();

/** The open review's vocabulary, from every document whose text has arrived. */
export function useVocabulary(): Term[] {
  const docs = useStore((s) => s.docs);
  return useMemo(() => {
    const all: Term[] = [];
    for (const d of Object.values(docs)) {
      if (d.status !== 'ready' || !d.pages.length) continue;
      let terms = cache.get(d.pages);
      if (!terms) {
        terms = extractTerms(d.pages.map((p) => p.text));
        cache.set(d.pages, terms);
      }
      all.push(...terms);
    }
    if (Object.keys(docs).length <= 1) return all;
    // Several documents: merge counts per term.
    const merged = new Map<string, Term>();
    for (const t of all) {
      const k = t.text.toLowerCase();
      const cur = merged.get(k);
      if (cur) cur.count += t.count;
      else merged.set(k, { ...t });
    }
    return [...merged.values()].sort((a, b) => b.count - a.count);
  }, [docs]);
}

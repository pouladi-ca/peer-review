import type { PageText, QuickFacts, TextLine } from '../types';

const STOP = new Set(
  'the and for that with this from which will have been were are was our their these those into than then also such more most other some each between within about using used use based both may can could would should than data study studies research proposed propose project aims aim specific significance approach however therefore while where when whether through during after before under over across per among via well however including include includes included provide provides provided determine determined identify identified evaluate evaluated develop developed established establish results result method methods analysis analyses figure table page year years months first second third new high low large small number total further work group groups model models system systems level levels time effect effects role potential important novel application applicant university hospital institute department'.split(/\s+/),
);

function titleFromFirstPages(pages: PageText[]): string | undefined {
  const first = pages.slice(0, 2);
  const lines = first.flatMap((p) => p.lines);
  if (lines.length === 0) return undefined;
  // Explicit label wins.
  for (const l of lines) {
    const m = l.text.match(/^(?:project |proposal |application )?title\s*[:\-–]\s*(.{8,200})$/i);
    if (m) return m[1].trim();
  }
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^(?:project |proposal |application )?title\s*:?$/i.test(lines[i].text.trim())) {
      const next = lines[i + 1].text.trim();
      if (next.length > 8) return next;
    }
  }
  // Largest type on the first page, merging adjacent lines of the same size.
  const p1 = first[0].lines.filter((l) => l.text.trim().length > 3 && !/^\d+$/.test(l.text));
  if (p1.length === 0) return undefined;
  const maxSize = Math.max(...p1.map((l) => l.size));
  const bodyish = p1.filter((l) => l.size >= maxSize - 0.5);
  const startIdx = p1.indexOf(bodyish[0]);
  const parts: string[] = [];
  for (let i = startIdx; i < p1.length; i++) {
    if (p1[i].size < maxSize - 0.5) break;
    parts.push(p1[i].text.trim());
    if (parts.join(' ').length > 220) break;
  }
  const t = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (t.length < 8) return undefined;
  return t;
}

function labelled(lines: TextLine[], labels: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text.trim();
    const m = t.match(labels);
    if (!m) continue;
    const rest = t.slice(m[0].length).replace(/^[\s:\-–]+/, '').trim();
    if (rest.length > 2) return rest.slice(0, 120);
    if (lines[i + 1] && lines[i + 1].text.trim().length > 2) return lines[i + 1].text.trim().slice(0, 120);
  }
  return undefined;
}

function detectBudget(text: string): string | undefined {
  const rx = /(?:total|requested|request|amount|budget|direct costs?)[^\n$€£]{0,60}([$€£]\s?\d{1,3}(?:[,\s]\d{3})+(?:\.\d{2})?)/gi;
  let best: { v: number; s: string } | undefined;
  for (const m of text.matchAll(rx)) {
    const v = Number(m[1].replace(/[^\d.]/g, ''));
    if (!best || v > best.v) best = { v, s: m[1].replace(/\s/g, '') };
  }
  if (best) return best.s;
  const any = [...text.matchAll(/[$€£]\s?\d{1,3}(?:,\d{3}){1,3}/g)].map((m) => ({ v: Number(m[0].replace(/[^\d]/g, '')), s: m[0].replace(/\s/g, '') }));
  if (any.length === 0) return undefined;
  const top = any.sort((a, b) => b.v - a.v)[0];
  return top.v >= 10000 ? top.s : undefined;
}

function detectDuration(text: string): string | undefined {
  const m =
    text.match(/(?:duration|period of support|project period|term|over)\D{0,30}(\d{1,2})\s*(?:-|–)?\s*(years?|yrs?|months?)/i) ??
    text.match(/(\d)\s*[- ]?year (?:project|study|program|programme|grant|period)/i);
  if (m) return `${m[1]} ${m[2] ? m[2].toLowerCase().replace(/^yrs?$/, 'years') : 'years'}`;
  return undefined;
}

function detectMechanism(text: string): string | undefined {
  const m = text.match(/\b(R01|R21|R03|R35|R56|U01|U54|P01|P50|K01|K08|K99\/R00|K99|R00|F31|F32|T32|DP1|DP2|Project Grant|Foundation Grant|Discovery Grant|Starting Grant|Consolidator Grant|Advanced Grant|Synergy Grant|CAREER|Standard Grant|Investigator Award|Fellowship)\b/);
  return m?.[1];
}

function detectAims(pages: PageText[]): string[] {
  const aims: string[] = [];
  const seen = new Set<string>();
  const rx = /^(?:specific\s+)?(?:aim|objective|goal)\s*(\d+|[IVX]+)\s*[:.\-–)]?\s*(.{10,})$/i;
  for (const p of pages) {
    const lines = p.lines;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].text.trim().match(rx);
      if (!m) continue;
      let body = m[2].trim();
      // Skip prose references like "Aim 1 design." or "Aim 2 will…": a genuine
      // aim statement begins with an uppercase word (usually "To ...").
      if (!/^[A-Z]/.test(body) || /^(design|will|is|was|and|of|for|the|occup|design and)\b/i.test(body)) continue;
      // Continue onto following lines until a sentence end.
      let j = i + 1;
      while (!/[.!?]$/.test(body) && j < lines.length && j < i + 3 && body.length < 260) {
        const nxt = lines[j].text.trim();
        if (rx.test(nxt) || nxt.length === 0) break;
        body += ' ' + nxt;
        j++;
      }
      body = body.replace(/\s+/g, ' ').replace(/^(?:to\s+)?/i, (s) => s).trim();
      const cut = body.search(/[.!?](\s|$)/);
      if (cut > 30) body = body.slice(0, cut + 1);
      const num = m[1].toUpperCase();
      const key = num + '|' + body.slice(0, 40).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      aims.push(`Aim ${num}: ${body}`);
      if (aims.length >= 12) break;
    }
  }
  // Dedupe by aim number, keeping the first (usually the Aims page) occurrence.
  const byNum = new Map<string, string>();
  for (const a of aims) {
    const n = a.match(/^Aim (\S+):/)?.[1] ?? a;
    if (!byNum.has(n)) byNum.set(n, a);
  }
  return [...byNum.values()].slice(0, 8);
}

function keyTerms(text: string, n = 12): string[] {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z-]{5,}/g) ?? []) {
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function countDistinct(text: string, rx: RegExp): number {
  const s = new Set<string>();
  for (const m of text.matchAll(rx)) s.add(m[1]);
  return s.size;
}

function countReferences(pages: PageText[]): number {
  const text = pages.map((p) => p.text).join('\n');
  const idx = text.search(/\n\s*(references|bibliography|literature cited|references cited)\s*\n/i);
  const tail = idx >= 0 ? text.slice(idx) : text;
  const numbered = (tail.match(/^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s+\S/gm) ?? []).length;
  if (numbered >= 5) return numbered;
  const years = (tail.match(/\(\d{4}[a-z]?\)/g) ?? []).length;
  return years;
}

export function extractFacts(pages: PageText[]): QuickFacts {
  const text = pages.map((p) => p.text).join('\n');
  const firstLines = pages.slice(0, 3).flatMap((p) => p.lines);
  const words = (text.match(/\S+/g) ?? []).length;
  return {
    title: titleFromFirstPages(pages),
    pi: labelled(firstLines, /^(?:principal investigator|nominated principal applicant|principal applicant|pd\/pi|pi|applicant|lead applicant|project lead)\b\s*(?:\(s\))?/i),
    institution:
      labelled(firstLines, /^(?:institution|organization|organisation|applicant organization|host institution|affiliation)\b/i) ??
      firstLines.map((l) => l.text.trim()).find((t) => /\b(university|institute|college|hospital|centre|center|school of)\b/i.test(t) && t.length < 100),
    mechanism: detectMechanism(text.slice(0, 30000)),
    budget: detectBudget(text),
    duration: detectDuration(text),
    aims: detectAims(pages),
    keyTerms: keyTerms(text),
    words,
    figures: countDistinct(text, /\bfig(?:ure|\.)?\s*(\d{1,2})/gi),
    tables: countDistinct(text, /\btable\s*(\d{1,2})/gi),
    references: countReferences(pages),
  };
}

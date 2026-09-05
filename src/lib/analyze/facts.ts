import type { PageText, QuickFacts, TextLine } from '../types';

const STOP = new Set(
  'the and for that with this from which will have been were are was our their these those into than then also such more most other some each between within about using used use based both may can could would should than data study studies research proposed propose project aims aim specific significance approach however therefore while where when whether through during after before under over across per among via well however including include includes included provide provides provided determine determined identify identified evaluate evaluated develop developed established establish results result method methods analysis analyses figure table page year years months first second third new high low large small number total further work group groups model models system systems level levels time effect effects role potential important novel application applicant university hospital institute department'.split(/\s+/),
);

const TITLE_LABEL = /^(?:project |proposal |application |grant |research |study )?title(?: of (?:the )?(?:project|proposal|research|application|study))?\s*[:\-–]?\s*/i;

function upperRatio(t: string): number {
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters) return 0;
  return letters.replace(/[^A-Z]/g, '').length / letters.length;
}

/** Reject strings that are form furniture rather than a title. */
function badTitle(t: string): boolean {
  return (
    t.length < 8 ||
    /^[(\[]/.test(t) || // parenthetical instructions
    /[:：]\s*$/.test(t) ||
    /\b(if renewal|current grant|form|application (form|type)|page \d|instructions?|cover ?sheet|face ?page|table of contents|characters?|truncated|including spaces|punctuation|maximum|limit|enter|please)\b/i.test(t) ||
    /[$€£]\s?\d/.test(t) ||
    /\.(pdf|docx?)\b/i.test(t) ||
    /_{3,}/.test(t) ||
    (upperRatio(t) > 0.7 && t.length < 40)
  );
}

function titleFromFirstPages(pages: PageText[]): string | undefined {
  const first = pages.slice(0, 4);
  const lines = first.flatMap((p) => p.lines);
  if (lines.length === 0) return undefined;
  // Explicit label wins, on the same line or the next.
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text.trim();
    if (!TITLE_LABEL.test(t)) continue;
    const rest = t.replace(TITLE_LABEL, '').trim();
    if (rest.length >= 8 && !badTitle(rest)) return rest.slice(0, 220);
    // Portal forms often put instructions between the label and the value; look a few lines ahead.
    for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
      const next = lines[j].text.trim();
      if (next.length < 8 || TITLE_LABEL.test(next)) continue;
      if (badTitle(next)) continue;
      if (/^[^:]{1,30}:\s*\S/.test(next)) break; // ran into the next field
      return next.slice(0, 220);
    }
  }
  // Largest type on the first page, merging adjacent lines of the same size.
  const p1 = pages[0].lines.filter((l) => l.text.trim().length > 3 && !/^\d+$/.test(l.text));
  if (p1.length === 0) return undefined;
  const sizes = [...new Set(p1.map((l) => Math.round(l.size * 2) / 2))].sort((a, b) => b - a);
  for (const size of sizes.slice(0, 3)) {
    const startIdx = p1.findIndex((l) => Math.abs(l.size - size) <= 0.5);
    if (startIdx < 0) continue;
    const parts: string[] = [];
    for (let i = startIdx; i < p1.length; i++) {
      if (Math.abs(p1[i].size - size) > 0.5) break;
      parts.push(p1[i].text.trim());
      if (parts.join(' ').length > 220) break;
    }
    const t = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!badTitle(t)) return t;
  }
  return undefined;
}

const NOT_A_NAME = /\b(name|degree|biosketch|title|role|position|applicant|investigator|director|application|contacts?|information|section|page|form|type|status|organi[sz]ation|institution|university|department|address|phone|e-?mail|prefix|suffix|first|last|middle)\b/i;

/** Does a string look like a person's name rather than a heading or label? */
function looksLikeName(v: string): boolean {
  const t = v.replace(/\s*[-–]\s*\d{4,}.*$/, '').trim(); // strip "- 1530329" ids
  if (t.length < 4 || t.length > 80) return false;
  if (upperRatio(t) > 0.8) return false;
  if (NOT_A_NAME.test(t)) return false;
  if (/\.(pdf|docx?)\b/i.test(t)) return false;
  return /^(?:Dr\.?\s+|Prof\.?\s+|Professor\s+)?[A-Z][\w'’.-]+(?:,\s*[A-Z][\w'’.-]+|\s+(?:[A-Z]\.?\s+)?[A-Z][\w'’.-]+)/.test(t);
}

const STRONG_PI_LABEL = /^(?:principal investigator|pd\/pi|pi name|proposal by|submitted by|applicant name|nominated principal applicant|principal applicant|project director|program director)/i;

/** Pick the best applicant-name candidate across all labelled lines. */
function bestName(lines: TextLine[], labels: RegExp): string | undefined {
  let best: { v: string; score: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text.trim();
    const m = t.match(labels);
    if (!m) continue;
    const rest = t.slice(m[0].length).replace(/^[\s:\-–]+/, '').trim();
    const next = lines[i + 1]?.text.trim() ?? '';
    const candidates = rest.length > 2 ? [rest] : next && !labels.test(next) ? [next] : [];
    for (const c of candidates) {
      if (!looksLikeName(c)) continue;
      let score = 1;
      if (STRONG_PI_LABEL.test(t)) score += 3;
      if (/^[A-Z][\w'’.-]+,\s*[A-Z]/.test(c)) score += 2; // "Last, First"
      if (/^(Dr|Prof)/.test(c)) score += 1;
      if (!best || score > best.score) best = { v: c, score };
    }
  }
  return best?.v;
}

function cleanName(v: string): string {
  return v.replace(/\s*[-–]\s*\d{4,}.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function labelled(lines: TextLine[], labels: RegExp, accept: (v: string) => boolean = (v) => v.length > 2): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text.trim();
    const m = t.match(labels);
    if (!m) continue;
    const rest = t.slice(m[0].length).replace(/^[\s:\-–]+/, '').trim();
    if (rest.length > 2 && accept(rest)) return rest.slice(0, 120);
    const next = lines[i + 1]?.text.trim() ?? '';
    if (rest.length <= 2 && next.length > 2 && accept(next) && !labels.test(next)) return next.slice(0, 120);
  }
  return undefined;
}

const INSTITUTION_WORDS = /\b(university|universit[aä]t|institute\b|institut\b|college|hospital|centre for|center for|school of|laboratory|foundation|academy|clinic|health system|medical cent|polytechnic)/i;

function institutionLike(v: string): boolean {
  if (v.length < 4 || v.length > 100) return false;
  if (/^(institution|organi[sz]ation|affiliation|employer)(\s*(name|&\s*contacts|contacts))?\s*:?$/i.test(v)) return false; // the label itself
  if (/^[^:]{1,30}:\s*$/.test(v)) return false; // "Something:" with no value
  return INSTITUTION_WORDS.test(v) && !/\.(pdf|docx?)\b/i.test(v) && !/biosketch|curriculum|résumé|resume|_{3,}/i.test(v) && upperRatio(v) < 0.9;
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
  const firstLines = pages.slice(0, 4).flatMap((p) => p.lines);
  const words = (text.match(/\S+/g) ?? []).length;
  const piRaw = bestName(
    firstLines,
    /^(?:principal investigator(?:\/program director)?|program director\/principal investigator|pd\/pi(?: name)?|pi name|nominated principal applicant|principal applicant|lead applicant|project lead|project director|proposal by|submitted by|applicant name|applicant)\b\s*(?:\(s\))?/i,
  );
  return {
    title: titleFromFirstPages(pages),
    pi: piRaw ? cleanName(piRaw) : undefined,
    institution:
      labelled(
        firstLines,
        /^(?:institution(?: name)?|organization(?: name)?|organisation(?: name)?|applicant organization|host institution|affiliation|employer|department\/institution)\b/i,
        institutionLike,
      ) ?? firstLines.map((l) => l.text.trim()).find((t) => institutionLike(t) && /^[A-Z]/.test(t)),
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

import type { OutlineEntry, PageText, TextLine } from '../types';
import type { Framework } from '../frameworks';

const KNOWN_HEADINGS: { rx: RegExp; hint?: string; level: 1 | 2 }[] = [
  { rx: /^(project )?summary\b|^abstract\b|^lay (summary|abstract)|^summary of (the )?research/i, level: 1 },
  { rx: /^specific aims?\b/i, level: 1 },
  { rx: /^(project )?narrative\b/i, level: 1 },
  { rx: /^research (strategy|plan|proposal|design|description)\b/i, level: 1 },
  { rx: /^(a\.?\s*)?significance\b/i, hint: 'significance', level: 1 },
  { rx: /^(b\.?\s*)?innovation\b/i, hint: 'innovation', level: 1 },
  { rx: /^(c\.?\s*)?approach\b/i, hint: 'approach', level: 1 },
  { rx: /^background\b|^introduction\b|^rationale\b|^state of the art\b/i, hint: 'significance', level: 1 },
  { rx: /^preliminary (data|results|studies|work)\b/i, hint: 'approach', level: 1 },
  { rx: /^(research )?(objectives?|hypothes[ie]s)\b/i, level: 1 },
  { rx: /^(methods?|methodology|experimental (design|approach)|study design)\b/i, hint: 'approach', level: 1 },
  { rx: /^(statistical|data) analys[ie]s\b/i, hint: 'approach', level: 2 },
  { rx: /^(potential )?(pitfalls|problems|limitations|challenges)( and (alternatives|mitigation))?\b/i, hint: 'approach', level: 2 },
  { rx: /^timeline\b|^work ?plan\b|^milestones?\b|^gantt\b|^schedule\b/i, hint: 'approach', level: 2 },
  { rx: /^(knowledge (translation|mobilization|transfer)|dissemination)\b/i, hint: 'approach', level: 2 },
  { rx: /^(sex|gender|sex[- ]and[- ]gender|SGBA)/i, hint: 'approach', level: 2 },
  { rx: /^intellectual merit\b/i, hint: 'merit', level: 1 },
  { rx: /^broader impacts?\b/i, hint: 'impacts', level: 1 },
  { rx: /^results? (from|of) prior (nsf )?support\b/i, level: 1 },
  { rx: /^(research )?team\b|^(the )?(investigators?|applicants?)\b|^(personnel|expertise)\b/i, hint: 'expertise', level: 1 },
  { rx: /^(research )?environment\b|^facilities\b|^(resources|equipment)\b/i, hint: 'expertise', level: 1 },
  { rx: /^budget( justification| and justification)?\b|^justification of (the )?budget\b/i, hint: 'budget', level: 1 },
  { rx: /^(references|bibliography|literature cited|references cited|works cited)\b/i, level: 1 },
  { rx: /^(biographical sketch|biosketch|curriculum vitae|cv\b)/i, hint: 'expertise', level: 1 },
  { rx: /^letters? of (support|collaboration|commitment)\b/i, hint: 'expertise', level: 1 },
  { rx: /^(human subjects?|protection of human subjects|vertebrate animals?|animal (use|care))\b/i, level: 1 },
  { rx: /^(data (management|sharing)( and sharing)? plan|resource sharing)\b/i, level: 1 },
  { rx: /^(inclusion|enrollment)\b/i, level: 1 },
  { rx: /^(ethics|ethical considerations?)\b/i, level: 1 },
  { rx: /^(postdoctoral )?mentoring plan\b/i, level: 1 },
  { rx: /^(project |research )?(description|proposal)\b/i, level: 1 },
  { rx: /^(expected|anticipated) (outcomes|results)\b/i, level: 2 },
  { rx: /^(work package|wp)\s*\d/i, level: 2 },
  { rx: /^(specific )?aim\s*\d+\b|^aim\s+[ivx]+\b/i, level: 2 },
  { rx: /^(objective|goal)\s*\d+\b/i, level: 2 },
  { rx: /^(appendix|appendices|supplementary)\b/i, level: 1 },
];

const NUMBERED = /^(?:\d{1,2}(?:\.\d{1,2}){0,2}\.?|[A-H]\.|[IVX]{1,4}\.)\s+(.+)$/;

function stripNumber(t: string): string {
  const m = t.match(NUMBERED);
  return (m ? m[1] : t).replace(/[.:]\s*$/, '').trim();
}

function weightedMedianSize(lines: TextLine[]): number {
  const buckets = new Map<number, number>();
  for (const l of lines) {
    const s = Math.round(l.size * 2) / 2;
    buckets.set(s, (buckets.get(s) ?? 0) + l.text.length);
  }
  const total = [...buckets.values()].reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const [size, count] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    acc += count;
    if (acc >= total / 2) return size;
  }
  return 10;
}

/**
 * Detects section headings from positioned lines. It combines two signals:
 * lines set in a larger font than the body, and lines that match headings the
 * major agencies expect. Numbering prefixes are stripped for display.
 */
export function detectOutline(pages: PageText[], fw?: Framework): OutlineEntry[] {
  const allLines = pages.flatMap((p) => p.lines);
  if (allLines.length === 0) return [];
  const body = weightedMedianSize(allLines);
  const out: OutlineEntry[] = [];
  const seen = new Set<string>();
  const expected = (fw?.expectedSections ?? []).map((s) => s.toLowerCase());
  // The document title is usually the largest text on page 1, above the first
  // real section. Treat title-sized lines there as the title, not headings.
  const firstPageNo = pages[0]?.page;
  const titleSize = body * 1.55;

  for (const line of allLines) {
    const raw = line.text.trim();
    if (raw.length < 3 || raw.length > 90) continue;
    if (/^\d+$/.test(raw)) continue; // page numbers
    if (/[.;,]$/.test(raw) && raw.length > 40) continue; // sentence fragments
    const title = stripNumber(raw);
    const lower = title.toLowerCase();
    const bigger = line.size >= body * 1.15;
    const numbered = NUMBERED.test(raw);
    const known = KNOWN_HEADINGS.find((k) => k.rx.test(title));
    const isExpected = expected.some((e) => lower === e || lower.startsWith(e + ' ') || lower.startsWith(e + ':'));
    // Suppress the cover title: title-sized page-1 lines that are not a known section.
    if (!known && !isExpected && line.page === firstPageNo && line.size >= titleSize) continue;
    const words = title.split(/\s+/).length;
    const titleCase = words <= 8 && /^[A-Z]/.test(title) && !/\b(the|and|of|in|to|for|a)\b.*\b(the|and|of|in|to|for|a)\b.*\b(the|and|of|in|to|for|a)\b/i.test(title);

    let accept = false;
    let level: 1 | 2 = 2;
    if (known && (bigger || numbered || known.level === 1 || words <= 6)) {
      accept = true;
      level = known.level;
    } else if (isExpected) {
      accept = true;
      level = 1;
    } else if (bigger && titleCase && words <= 10) {
      accept = true;
      level = line.size >= body * 1.35 ? 1 : 2;
    } else if (numbered && bigger) {
      accept = true;
      level = raw.match(/^\d+\.\d/) ? 2 : 1;
    }
    if (!accept) continue;

    const key = `${lower}|${line.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `o${out.length}`,
      title,
      page: line.page,
      y: line.y,
      level,
      criterionHint: known?.hint,
    });
  }

  // Suppress running headers that repeat on many pages.
  const counts = new Map<string, number>();
  for (const e of out) counts.set(e.title.toLowerCase(), (counts.get(e.title.toLowerCase()) ?? 0) + 1);
  const pageCount = pages.length;
  return out.filter((e) => (counts.get(e.title.toLowerCase()) ?? 0) < Math.max(3, pageCount * 0.4));
}

/** Map an outline hint to the framework's criterion id, when there is a match. */
export function criterionForHint(fw: Framework, hint?: string): string | undefined {
  if (!hint) return undefined;
  const direct = fw.criteria.find((c) => c.id === hint);
  if (direct) return direct.id;
  const byKeyword = fw.criteria.find((c) => c.keywords?.some((k) => k.toLowerCase() === hint.toLowerCase()));
  return byKeyword?.id;
}

/** The nearest outline entry at or above a page position. */
export function sectionAt(outline: OutlineEntry[], page: number, y = 0): OutlineEntry | undefined {
  let best: OutlineEntry | undefined;
  for (const e of outline) {
    if (e.page < page || (e.page === page && e.y <= y + 0.001)) best = e;
    else break;
  }
  return best;
}

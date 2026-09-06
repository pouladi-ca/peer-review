/**
 * Ligature repair.
 *
 * Some PDFs (notably portal exports set in Calibri or Cambria) contain
 * ligature glyphs such as "ti", "fi", or "ff" without a Unicode mapping.
 * pdf.js emits U+0000 for each of them, so "Justification" arrives with two
 * NULs in it. Each NUL is exactly one missing ligature, which lets us repair
 * words precisely: try every candidate fill and keep the one that makes a
 * word the document itself uses, a common English word, or at least a
 * plausible morpheme. Anything still unresolved takes the ligature the
 * document uses most, which is usually right because a given font tends to
 * lose the same glyph everywhere.
 */

export const LIGATURES = ['ti', 'fi', 'ff', 'fl', 'ffi', 'ffl', 'st', 'tt', 'ft', 'Th', 'th', 'ct'] as const;

const NUL = '\u0000';
const BROKEN_TOKEN = /[A-Za-z]*\u0000[A-Za-z\u0000]*/g;

/** Frequent words in research writing that contain ligature pairs. */
const COMMON = new Set(
  `justification justify justified specific specifically specification specified significant significance significantly scientific scientist
  application applications applicant applicants apply objective objectives qualification qualifications identification identify identified
  function functional functions mutation mutations information institution institutional potential potentially effective effectiveness
  efficient efficiency efficacy sufficient sufficiently insufficient difficult difficulty benefit benefits beneficial first field fields final
  finally finding findings fluorescence fluorescent flow influence influences definition define defined definitive confirm confirmation
  activities activity reflect reflects reflected staff effort efforts affect affected affects different differences differentiate differentiation
  quantification quantify quantitative verification verify modification modify publication publications participation participants participate
  translation translational regulation regulate stimulation evaluation evaluate communication preliminary initiative initial initially
  ratio ratios relation relationship relative relatively station statistical statistics statistically satisfaction national international
  education educational operation operational population populations condition conditions conditional additional addition traditional
  action actions section sections selection selective collection collective detection direction directions production productive
  protection protective reduction infection infections injection inflammation inflammatory tissue tissues fibrosis fibroblast fibroblasts
  affinity efficiently profile profiles profiling filter filtered finite figure figures fifteen fifth fifty file files fit fitness fitting
  office official officer differential difference differentially offer offers offered effect effects afford stuff cutoff tradeoff
  study studies student students structure structural structures strategy strategies statement status stage stages standard standards
  test tests tested testing question questions questionnaire understand understanding investigate investigation investigator investigators
  institute institutes estimate estimates estimated stimulate distinct distribution district trust cluster clusters cystic system
  attention attitude attribute attributes attrition letter letters little better matter pattern patterns setting settings written committee
  soft shift shifted after afterwards gift left often draft drafts theory theoretical thereby therefore this that these those
  activation active actively actual actually factor factors facts practical practice practices
  characterization characterize characteristic characteristics contract contracts direct directly directed expected exact exactly
  intervention interventions prevention preventive perfection reaction reactive interaction interactions extraction predict prediction`
    .split(/\s+/)
    .filter(Boolean),
);

/** Morphemes that usually indicate a particular fill. Scored lightly. */
const MORPHEMES: { rx: RegExp; score: number }[] = [
  { rx: /tion(s|al|ally)?$/, score: 3 },
  { rx: /tive(s|ly|ness)?$/, score: 3 },
  { rx: /tial(ly)?$/, score: 2 },
  { rx: /ti(es|ty|fy|fied|fies)$/, score: 2 },
  { rx: /(ti|fi)c(al|ally|ation|ations|ance|ant)?$/, score: 2 },
  { rx: /fficien(t|cy)$/, score: 3 },
  { rx: /ffer(ent|ence|ential)?$/, score: 2 },
  { rx: /ffect(s|ive|ed)?$/, score: 2 },
  { rx: /^(first|field|final|fin|fig|fil|fit|fix|flow|flu|fluor|fla|fle)/i, score: 2 },
  { rx: /^(st|str)/, score: 1 },
  { rx: /(st|ist|ast|ust|est)$/, score: 1 },
];

const wordsOf = (text: string): string[] => text.match(/[A-Za-z]{3,}/g) ?? [];

function* fills(token: string): Generator<string> {
  const holes = token.split(NUL);
  const n = holes.length - 1;
  if (n === 0) return;
  const idx = new Array<number>(n).fill(0);
  const total = Math.pow(LIGATURES.length, n);
  for (let k = 0; k < total; k++) {
    let out = holes[0];
    for (let h = 0; h < n; h++) out += LIGATURES[idx[h]] + holes[h + 1];
    yield out;
    let h = 0;
    while (h < n) {
      idx[h] += 1;
      if (idx[h] < LIGATURES.length) break;
      idx[h] = 0;
      h += 1;
    }
  }
}

function ligaturesUsed(token: string, filled: string): string[] {
  const holes = token.split(NUL);
  const used: string[] = [];
  let pos = 0;
  for (let h = 0; h < holes.length - 1; h++) {
    pos += holes[h].length;
    const next = holes[h + 1];
    const end = next ? filled.indexOf(next, pos) : filled.length;
    used.push(filled.slice(pos, end === -1 ? filled.length : end));
    pos = end === -1 ? filled.length : end;
  }
  return used;
}

export interface LigatureRepair {
  /** Number of distinct broken tokens found. */
  count: number;
  /** The fill the document uses most often. */
  dominant: string;
  /** Repair every broken token in a string. Strings without NULs are returned as-is. */
  fix(s: string): string;
  /** How each broken token was resolved, for inspection. */
  map: Map<string, string>;
}

const NOOP: LigatureRepair = { count: 0, dominant: 'ti', fix: (s) => s, map: new Map() };

const holeCount = (token: string): number => token.split(NUL).length - 1;

/** Build a repair from all of a document's text. */
export function buildLigatureRepair(texts: string[]): LigatureRepair {
  const joined = texts.join('\n');
  if (!joined.includes(NUL)) return NOOP;

  const vocab = new Set<string>();
  for (const t of texts) for (const w of wordsOf(t.replace(BROKEN_TOKEN, ' '))) vocab.add(w.toLowerCase());

  const broken = new Set<string>();
  for (const t of texts) for (const m of t.match(BROKEN_TOKEN) ?? []) if (m.length > 1) broken.add(m);

  const map = new Map<string, string>();
  const tally = new Map<string, number>();
  const pending: string[] = [];

  const scoreFill = (f: string): number => {
    const lower = f.toLowerCase();
    let score = 0;
    if (vocab.has(lower)) score += 10;
    if (COMMON.has(lower)) score += 6;
    for (const m of MORPHEMES) if (m.rx.test(lower)) score += m.score;
    return score;
  };

  // Pass 1: resolve tokens that produce a known word.
  for (const token of broken) {
    if (holeCount(token) > 4) {
      pending.push(token);
      continue;
    }
    let best: { f: string; score: number } | undefined;
    for (const f of fills(token)) {
      const score = scoreFill(f);
      if (score >= 6 && (!best || score > best.score)) best = { f, score };
    }
    if (best) {
      map.set(token, best.f);
      for (const l of ligaturesUsed(token, best.f)) tally.set(l, (tally.get(l) ?? 0) + 1);
    } else pending.push(token);
  }

  const dominant = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ti';

  // Pass 2: the rest use morpheme hints, tie-broken by the dominant fill.
  for (const token of pending) {
    if (holeCount(token) > 4) {
      map.set(token, token.split(NUL).join(dominant));
      continue;
    }
    let best: { f: string; score: number } | undefined;
    for (const f of fills(token)) {
      let score = scoreFill(f);
      score += ligaturesUsed(token, f).filter((u) => u === dominant).length * 0.5;
      if (!best || score > best.score) best = { f, score };
    }
    map.set(token, best ? best.f : token.split(NUL).join(dominant));
  }

  const fix = (s: string): string => {
    if (!s.includes(NUL)) return s;
    return s.replace(BROKEN_TOKEN, (m) => map.get(m) ?? m.split(NUL).join(dominant));
  };
  return { count: broken.size, dominant, fix, map };
}

/**
 * A repair built from text that is already clean (the server's extraction), for fixing
 * selections copied from the pdf.js text layer, which still carries the NULs. Each broken
 * token is resolved on first sight against the document's own vocabulary, which is a
 * better dictionary than the broken text ever was.
 */
export function lazyLigatureRepair(texts: string[]): LigatureRepair {
  const vocab = new Set<string>();
  for (const t of texts) for (const w of wordsOf(t)) vocab.add(w.toLowerCase());
  const map = new Map<string, string>();
  const dominant = 'ti';
  const scoreFill = (f: string): number => {
    const lower = f.toLowerCase();
    let score = 0;
    if (vocab.has(lower)) score += 10;
    if (COMMON.has(lower)) score += 6;
    for (const m of MORPHEMES) if (m.rx.test(lower)) score += m.score;
    return score;
  };
  const resolve = (token: string): string => {
    const cached = map.get(token);
    if (cached) return cached;
    let out = token.split(NUL).join(dominant);
    if (holeCount(token) <= 4) {
      let best: { f: string; score: number } | undefined;
      for (const f of fills(token)) {
        const score = scoreFill(f);
        if (!best || score > best.score) best = { f, score };
      }
      if (best && best.score > 0) out = best.f;
    }
    map.set(token, out);
    return out;
  };
  const fix = (s: string): string => (s.includes(NUL) ? s.replace(BROKEN_TOKEN, (m) => resolve(m)) : s);
  return { count: 0, dominant, fix, map };
}

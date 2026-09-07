/**
 * The proposal's own vocabulary, for autocomplete while writing: the aim names, gene and
 * protein symbols, acronyms, instruments, and long technical words that a reviewer must
 * spell exactly as the applicant did. Built from the extracted page text; nothing else.
 */

export interface Term {
  text: string;
  count: number;
}

const TOKEN = /[A-Za-z][A-Za-z0-9]*(?:[-/][A-Za-z0-9]+)*/g;
const CAP_STOP = new Set(
  'The This That These Those There Here We Our In On At To For From With Without By As Of And Or But If Then Thus However Although Because While When Where Which What Who Whose Whom How Why Not No Yes All Any Both Each Either Few More Most Other Some Such Than Too Very Can Will Would Should Could May Might Must Shall Do Does Did Have Has Had Is Are Was Were Be Been Being Am An A It Its They Them Their Also Only Just Even Still Already Finally First Second Third Last Next Previous Table Figure Page Aim Aims Specific Overall Section Introduction Background Approach Methods Results Discussion Summary Abstract References Budget Timeline'.split(
    ' ',
  ),
);

function keep(tok: string, count: number): boolean {
  const hasDigit = /\d/.test(tok);
  const allCaps = /^[A-Z][A-Z0-9-]{1,9}$/.test(tok);
  const mixed = /[a-z][A-Z]|^[A-Z]{2,}[a-z]/.test(tok) || /[-/]/.test(tok);
  if (hasDigit || allCaps || mixed) return count >= 1 && tok.length >= 2;
  if (/^[A-Z][a-z]+$/.test(tok)) return count >= 2 && !CAP_STOP.has(tok) && tok.length >= 4;
  return tok.length >= 8 && count >= 2;
}

/** Terms worth offering, most frequent first, at most `limit`. */
export function extractTerms(texts: string[], limit = 800): Term[] {
  const byLower = new Map<string, Map<string, number>>();
  for (const text of texts) {
    for (const m of text.match(TOKEN) ?? []) {
      const tok = m.replace(/[-/]+$/, '');
      if (tok.length < 2 || tok.length > 40) continue;
      const key = tok.toLowerCase();
      const variants = byLower.get(key) ?? new Map<string, number>();
      variants.set(tok, (variants.get(tok) ?? 0) + 1);
      byLower.set(key, variants);
    }
  }
  // A token that is two known words glued together (an extraction artefact such as
  // "exosomalmiR-133b") is not vocabulary.
  const known = (k: string) => {
    const v = byLower.get(k);
    if (!v) return false;
    let n = 0;
    for (const c of v.values()) n += c;
    return n >= 2;
  };
  const glued = (tok: string): boolean => {
    for (let i = 4; i <= tok.length - 2; i++) {
      if (!/[a-z]/.test(tok[i - 1]) || !/[A-Za-z]/.test(tok[i])) continue;
      if (known(tok.slice(0, i).toLowerCase()) && known(tok.slice(i).toLowerCase())) return true;
    }
    return false;
  };
  const out: Term[] = [];
  for (const variants of byLower.values()) {
    let best = '';
    let bestCount = 0;
    let total = 0;
    for (const [tok, n] of variants) {
      total += n;
      if (n > bestCount) {
        best = tok;
        bestCount = n;
      }
    }
    if (keep(best, total) && !glued(best)) out.push({ text: best, count: total });
  }
  return out.sort((a, b) => b.count - a.count || a.text.length - b.text.length).slice(0, limit);
}

/** The word being typed: from the last delimiter before the caret to the caret. */
export function wordBeforeCaret(value: string, caret: number): { start: number; text: string } {
  let start = caret;
  while (start > 0 && /[A-Za-z0-9\-/]/.test(value[start - 1])) start -= 1;
  return { start, text: value.slice(start, caret) };
}

/** Up to `limit` terms that continue what is typed, most frequent first. */
export function suggest(terms: Term[], typed: string, limit = 6): Term[] {
  if (typed.length < 3) return [];
  const q = typed.toLowerCase();
  return terms.filter((t) => t.text.toLowerCase().startsWith(q) && t.text.toLowerCase() !== q).slice(0, limit);
}

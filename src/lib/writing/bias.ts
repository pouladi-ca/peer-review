/**
 * A gentle guard against wording that agencies flag as reviewer bias: remarks about a
 * person rather than the work, expectations tied to career stage or institution, and
 * signs of a conflict of interest. Each hit carries the phrase and a reason, and is
 * only ever a suggestion.
 */

export interface BiasHit {
  id: string;
  phrase: string;
  reason: string;
}

const RULES: { id: string; re: RegExp; reason: string }[] = [
  { id: 'age', re: /\b(young|youthful|elderly|older|aging|ageing)\s+(investigator|applicant|PI|scientist|researcher|candidate)\b/i, reason: 'Judge the record, not the age.' },
  { id: 'stage-as-limit', re: /\bfor (a|an) (young|junior|new|early[- ]career|female|woman|male|foreign|international) (investigator|applicant|scientist|PI|researcher|candidate)\b/i, reason: 'Measure the plan against the resources, not against expectations for the person’s stage or background.' },
  { id: 'tone-descriptors', re: /\b(aggressive|abrasive|bossy|strident|emotional|feisty|pushy|arrogant|charming|likeable|pleasant)\b/i, reason: 'Personality descriptors track reviewer bias; describe the work instead.' },
  { id: 'surprise', re: /\b(surprisingly|remarkably|unexpectedly)\s+(good|strong|well|competent|sophisticated|polished)\b/i, reason: 'Surprise implies an expectation about the applicant; state the merit on its own.' },
  { id: 'institution', re: /\b(small|lesser[- ]known|unknown|obscure|prestigious|elite|top[- ]tier|second[- ]tier|minor)\s+(institution|university|school|college|lab|laboratory|department|center|centre)\b/i, reason: 'Judge the environment’s resources and support, not its name.' },
  { id: 'language', re: /\b(native (english )?speaker|non-?native|(poor|broken|bad|weak) english|english is (poor|weak|bad)|grammar|spelling|typos?)\b/i, reason: 'Language quality is outside the criteria unless it prevents understanding; if so, say what was unclear.' },
  { id: 'personal', re: /\b(maternity|paternity|pregnan\w*|family (obligations|commitments|situation)|child ?care|children|husband|wife|spouse|health issues?)\b/i, reason: 'Personal circumstances are outside the criteria.' },
  { id: 'demographic', re: /\b(nationality|ethnic\w*|racial|race|religio\w*|gender|his wife|her husband|immigrant|foreigner)\b/i, reason: 'Applicant demographics are outside the criteria.' },
  { id: 'coi-know', re: /\bI (know|have met|have worked with|collaborated with|trained) (him|her|them|the (applicant|PI|candidate))\b/i, reason: 'This reads as a possible conflict of interest; check the checklist item.' },
  { id: 'coi-cite', re: /\b(cite[sd]?|citing) (my|our) (work|paper|papers|lab|study)\b/i, reason: 'Citing your own work is not a review criterion, and it can signal a conflict.' },
  { id: 'gut', re: /\b(gut feeling|I just (don’t|do not) (like|trust)|rubs me the wrong way)\b/i, reason: 'An impression is not a finding; name what in the application produced it.' },
];

export function biasCheck(text: string): BiasHit[] {
  if (!text.trim()) return [];
  const hits: BiasHit[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) hits.push({ id: r.id, phrase: m[0], reason: r.reason });
  }
  // One note per passage: a phrase contained in a longer, more specific hit is dropped.
  hits.sort((a, b) => b.phrase.length - a.phrase.length);
  const out: BiasHit[] = [];
  for (const h of hits) if (!out.some((k) => k.phrase.toLowerCase().includes(h.phrase.toLowerCase()))) out.push(h);
  return out;
}

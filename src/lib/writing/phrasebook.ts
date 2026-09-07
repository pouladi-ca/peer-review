/**
 * A phrasebook keyed by situation rather than by word: what a reviewer is trying to say
 * (a strength, a minor or major weakness, a question, a weighing, a summary, a note to
 * the applicant), with placeholders in braces for the specifics. Entries carry criterion
 * hints so the ones that fit the box being written rank first.
 */

export type PhraseUse = 'summary' | 'strength' | 'minor' | 'major' | 'question' | 'weighing' | 'applicant';

export interface Phrase {
  id: string;
  use: PhraseUse;
  text: string;
  /** Criterion keywords (matched against a framework criterion's keywords and name) that this phrase suits. */
  hints?: string[];
}

export const USE_LABELS: Record<PhraseUse, string> = {
  summary: 'Summary',
  strength: 'Strength',
  minor: 'Minor weakness',
  major: 'Major weakness',
  question: 'Question',
  weighing: 'Weighing',
  applicant: 'To the applicant',
};

const p = (id: string, use: PhraseUse, text: string, hints?: string[]): Phrase => ({ id, use, text, hints });

export const PHRASEBOOK: Phrase[] = [
  // Summary and openers
  p('s1', 'summary', 'The applicant proposes to {aim}, building on {preliminary finding}.'),
  p('s2', 'summary', 'This application addresses {problem}, a gap that matters because {consequence}.'),
  p('s3', 'summary', 'The central hypothesis is that {hypothesis}, tested through {n} aims: {aims}.'),
  p('s4', 'summary', 'The work would deliver {product or dataset}, positioned to {downstream use}.'),
  p('s5', 'summary', 'The request is {budget} over {duration} for a team led by {applicant}, whose record in {field} is {characterisation}.'),
  p('s6', 'summary', 'The application is well written and easy to follow; the aims are logically connected and clearly stated.'),
  p('s7', 'summary', 'The proposal is ambitious in scope; whether it can be completed as described is discussed under {criterion}.'),

  // Strengths
  p('st1', 'strength', 'A major strength is {specific feature}, which {why it matters}.'),
  p('st2', 'strength', 'The preliminary data convincingly show {finding}, which lends credibility to {aim}.'),
  p('st3', 'strength', 'The team combines {expertise} with {expertise}, well matched to the demands of {task}.', ['investigator', 'team', 'expertise', 'applicant', 'candidate']),
  p('st4', 'strength', 'The design includes {control or feature}, which addresses {pitfall} head-on.', ['approach', 'design', 'methods', 'rigor']),
  p('st5', 'strength', 'Success would {advance}, changing how {field} approaches {problem}.', ['significance', 'impact', 'importance', 'relevance']),
  p('st6', 'strength', 'The approach departs from {current practice} in a way that could {benefit}.', ['innovation', 'novelty', 'innovative']),
  p('st7', 'strength', 'Sample sizes are justified by a power analysis based on {effect size source}.', ['approach', 'rigor', 'statistic', 'design']),
  p('st8', 'strength', 'Potential pitfalls are anticipated, with credible alternatives for {aim}.', ['approach', 'feasibility']),
  p('st9', 'strength', 'The environment offers {resource}, and the letters confirm access to {resource or cohort}.', ['environment', 'resources', 'institution', 'feasibility']),
  p('st10', 'strength', 'The timeline is realistic, with milestones that allow {aim} to proceed independently of {aim}.', ['feasibility', 'timeline']),
  p('st11', 'strength', 'The collaboration with {clinical partner} is substantive: the partner contributes to {design, conduct, or interpretation}.', ['collaboration', 'clinical', 'partner']),
  p('st12', 'strength', 'The use of {patient-derived samples or data} ties the mechanistic work to the human disease.', ['impact', 'approach', 'samples', 'clinical']),
  p('st13', 'strength', 'The mentor has a strong record of training {trainees}, and the plan describes {concrete activity}.', ['mentor', 'training', 'candidate']),
  p('st14', 'strength', 'The budget is appropriate for the scope, and each line is justified.', ['budget']),

  // Minor weaknesses
  p('mi1', 'minor', 'A minor concern is {issue}; it does not affect the overall assessment.'),
  p('mi2', 'minor', '{Section} would benefit from {clarification}, though the intent can be inferred.'),
  p('mi3', 'minor', 'The description of {procedure} is brief; a sentence on {detail} would remove any ambiguity.'),
  p('mi4', 'minor', 'Some statements, such as {claim}, would be stronger with a citation or a data point.'),
  p('mi5', 'minor', 'The {figure or table} is hard to read at the size provided; this does not change the interpretation.'),
  p('mi6', 'minor', '{Line item} appears higher than the plan requires and could be reduced.', ['budget']),

  // Major weaknesses
  p('ma1', 'major', 'A significant weakness is {issue}, which undermines {aim or conclusion}.'),
  p('ma2', 'major', 'Without {missing element}, it is difficult to judge whether {claim} can be supported.'),
  p('ma3', 'major', 'The proposal does not address {alternative explanation}, leaving {aim} vulnerable to {failure mode}.', ['approach', 'rigor']),
  p('ma4', 'major', 'Feasibility is uncertain: {constraint}, and the timeline allows only {duration} for {task}.', ['feasibility', 'timeline']),
  p('ma5', 'major', 'The premise rests on {evidence}, which is {preliminary, contested, or from a different system}; the risk that {assumption} fails is not discussed.', ['premise', 'significance', 'approach']),
  p('ma6', 'major', 'No power analysis or sample-size justification is given for {experiment}, so negative results would be uninterpretable.', ['approach', 'rigor', 'statistic']),
  p('ma7', 'major', 'Aim {n} depends on the success of Aim {m}; if {outcome} does not materialise, the later work cannot proceed as planned.', ['approach', 'feasibility']),
  p('ma8', 'major', 'The team lacks documented expertise in {method}, and no collaborator or letter covers it.', ['investigator', 'team', 'expertise', 'candidate']),
  p('ma9', 'major', 'The clinical collaboration amounts to {data access or a letter}; the partner has no role in design, conduct, or interpretation.', ['collaboration', 'clinical']),
  p('ma10', 'major', 'The work is largely confirmatory of {prior finding}; the incremental advance does not match the resources requested.', ['innovation', 'significance', 'impact']),
  p('ma11', 'major', 'Sex as a biological variable is not considered, although {reason it matters here}.', ['approach', 'rigor']),
  p('ma12', 'major', 'The plan for {recruitment or sample procurement} is not credible at the numbers proposed.', ['feasibility', 'recruitment', 'samples']),

  // Questions
  p('q1', 'question', 'It is unclear how {procedure} will handle {condition}.'),
  p('q2', 'question', 'The applicants should clarify {point}, since the interpretation of {aim} depends on it.'),
  p('q3', 'question', 'How will {outcome} be distinguished from {confound}?'),
  p('q4', 'question', 'What is the plan if {expected result} is not observed in {timeframe}?'),
  p('q5', 'question', 'Have {samples or participants} already been secured, or does the work depend on future access?', ['feasibility', 'samples', 'recruitment']),

  // Weighing and overall
  p('w1', 'weighing', 'On balance, the strengths in {area} outweigh the concerns about {area}.'),
  p('w2', 'weighing', 'The weaknesses noted under {criterion} are correctable and do not diminish enthusiasm.'),
  p('w3', 'weighing', 'Enthusiasm is tempered by {concern}, which affects {aims or the whole plan}.'),
  p('w4', 'weighing', 'This application has {high, moderate, or limited} potential to {impact}; the concerns are {fixable or fundamental}.'),
  p('w5', 'weighing', 'The score reflects {driver}, weighed against {driver}.'),
  p('w6', 'weighing', 'A stronger application would {change}, which would move it into the {fundable or top} range.'),
  p('w7', 'weighing', 'The application is technically sound but the question is of {modest or narrow} importance, which limits the overall impact.'),
  p('w8', 'weighing', 'Despite the concerns about {area}, the likely payoff justifies the risk.'),

  // Feedback for the applicant
  p('a1', 'applicant', 'In a revision, consider {action}, which would {benefit}.'),
  p('a2', 'applicant', 'The reviewers would be more confident if {evidence} were provided for {claim}.'),
  p('a3', 'applicant', 'Reframing {aim} around {question} would make its contribution clearer.'),
  p('a4', 'applicant', 'A short section on {risk} and how it would be handled would address the main concern.'),
  p('a5', 'applicant', 'The strongest part of the application is {part}; leading with it would help.'),
  p('a6', 'applicant', 'Consider adding a letter or a named collaborator for {method or resource}.'),
];

/** Words in a criterion's name and keywords, lower-cased, for matching phrase hints. */
function criterionTerms(c: { name: string; keywords?: string[] }): string[] {
  const fromName = c.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  return [...fromName, ...(c.keywords ?? []).map((k) => k.toLowerCase())];
}

/** Phrases for a set of uses, with the ones that fit the criterion first, then the general ones. */
export function phrasesFor(uses: PhraseUse[], criterion?: { name: string; keywords?: string[] }, query = ''): Phrase[] {
  const terms = criterion ? criterionTerms(criterion) : [];
  const q = query.trim().toLowerCase();
  const fits = (ph: Phrase) => (ph.hints ? ph.hints.some((h) => terms.some((t) => t.includes(h) || h.includes(t))) : false);
  return PHRASEBOOK.filter((ph) => uses.includes(ph.use))
    .filter((ph) => !q || ph.text.toLowerCase().includes(q) || USE_LABELS[ph.use].toLowerCase().includes(q))
    .filter((ph) => !ph.hints || !criterion || fits(ph) || !terms.length)
    .sort((a, b) => Number(fits(b)) - Number(fits(a)));
}

/** Split phrase text into literal and placeholder segments, for rendering and for selecting the first placeholder after insertion. */
export function placeholders(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /\{[^}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

/** A phrase the reviewer saved for reuse; private to their account and synced across devices. */
export interface UserPhrase {
  id: string;
  text: string;
  use: PhraseUse;
  createdAt: number;
}

/** The reviewer's own phrases for a set of uses, newest first, filtered by the search. */
export function userPhrasesFor(mine: UserPhrase[], uses: PhraseUse[], query = ''): UserPhrase[] {
  const q = query.trim().toLowerCase();
  return mine.filter((ph) => uses.includes(ph.use) && (!q || ph.text.toLowerCase().includes(q))).sort((a, b) => b.createdAt - a.createdAt);
}

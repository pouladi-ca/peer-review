/**
 * Review frameworks for major funding agencies.
 * Each framework describes the criteria a reviewer must address, how each is
 * scored, the overall rating, a completeness checklist, and the guidance the
 * agency gives its reviewers.
 */

export type ScaleDef =
  | {
      kind: 'numeric';
      min: number;
      max: number;
      step?: number;
      /** true when a low number is the best score (NIH). */
      bestIsLow: boolean;
      labels?: Record<number, string>;
      hint?: string;
    }
  | {
      kind: 'categorical';
      options: { value: string; label: string; hint?: string }[];
    };

export type CriterionGroup = 'core' | 'additional';

export interface Criterion {
  id: string;
  name: string;
  short: string;
  description: string;
  prompts: string[];
  scale?: ScaleDef; // undefined = framework default
  group: CriterionGroup;
  /** When true, the draft includes strengths/weaknesses bullets for this criterion. */
  bulleted?: boolean;
  /** Keyword hints used to map document sections and notes to this criterion. */
  keywords?: string[];
  /** True when the funder asks for comments only, with no rating for this criterion. */
  unscored?: boolean;
  /** The funder's character limit for this criterion's comment box, if any. */
  maxChars?: number;
}

export type ChecklistCategory = 'science' | 'rigor' | 'feasibility' | 'compliance' | 'reviewer';

export interface ChecklistItemDef {
  id: string;
  label: string;
  hint?: string;
  category: ChecklistCategory;
  /** Patterns that suggest the application addresses this item. */
  patterns?: RegExp[];
}

/** A free-text box on the funder's score sheet: its label, guidance, character limit, and whether it must be filled. */
export interface FieldSpec {
  label?: string;
  hint?: string;
  maxChars?: number;
  required?: boolean;
}

/** How the funder's score sheet labels and limits the free-text parts of a review. */
export interface FormSpec {
  /** The summary box (the review's draft summary). */
  summary?: FieldSpec;
  /** The catch-all comments box (the review's additional comments). */
  additional?: FieldSpec;
  /** The overall written assessment (the overall rationale). */
  overallComment?: FieldSpec;
  /** How the recommendation choice is labelled, and whether it must be answered. */
  recommendation?: { label: string; hint?: string; required?: boolean };
}

export interface Framework {
  id: string;
  name: string;
  agency: string;
  blurb: string;
  criteria: Criterion[];
  criterionScale: ScaleDef;
  overall: { label: string; description: string; scale: ScaleDef };
  recommendations?: string[];
  checklist: ChecklistItemDef[];
  guidance: string[];
  /** Section headings expected in the application for this agency. */
  expectedSections: string[];
  /** Labels and limits of the funder's free-text boxes, when they differ from the defaults. */
  form?: FormSpec;
  /** True for reviewer-defined frameworks stored in the browser. */
  custom?: boolean;
}

/* ---------- shared scales ---------- */

export const NIH_SCALE: ScaleDef = {
  kind: 'numeric',
  min: 1,
  max: 9,
  bestIsLow: true,
  labels: {
    1: 'Exceptional',
    2: 'Outstanding',
    3: 'Excellent',
    4: 'Very Good',
    5: 'Good',
    6: 'Satisfactory',
    7: 'Fair',
    8: 'Marginal',
    9: 'Poor',
  },
  hint: '1 is best. 1 to 3 high impact, 4 to 6 medium, 7 to 9 low.',
};

const ACCEPTABLE_SCALE: ScaleDef = {
  kind: 'categorical',
  options: [
    { value: 'acceptable', label: 'Acceptable' },
    { value: 'unacceptable', label: 'Unacceptable' },
    { value: 'na', label: 'Not applicable' },
  ],
};

const NSF_SCALE: ScaleDef = {
  kind: 'categorical',
  options: [
    { value: 'excellent', label: 'Excellent', hint: 'Outstanding proposal in all respects; deserves highest priority for support.' },
    { value: 'very-good', label: 'Very Good', hint: 'High quality proposal in nearly all respects; should be supported if at all possible.' },
    { value: 'good', label: 'Good', hint: 'A quality proposal, worthy of support.' },
    { value: 'fair', label: 'Fair', hint: 'Proposal lacking in one or more critical aspects; key issues need to be addressed.' },
    { value: 'poor', label: 'Poor', hint: 'Proposal has serious deficiencies.' },
  ],
};

const CIHR_DESCRIPTORS: ScaleDef = {
  kind: 'categorical',
  options: [
    { value: 'outstanding', label: 'Outstanding', hint: '4.5 to 4.9' },
    { value: 'excellent', label: 'Excellent', hint: '4.0 to 4.4' },
    { value: 'very-good', label: 'Very Good', hint: '3.5 to 3.9' },
    { value: 'good', label: 'Good', hint: '3.0 to 3.4' },
    { value: 'fair', label: 'Fair', hint: '2.5 to 2.9' },
    { value: 'poor', label: 'Poor', hint: '2.0 to 2.4' },
    { value: 'not-acceptable', label: 'Not acceptable', hint: '0 to 1.9' },
  ],
};

const FIVE_POINT: ScaleDef = {
  kind: 'numeric',
  min: 1,
  max: 5,
  bestIsLow: false,
  labels: { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' },
  hint: '5 is best.',
};

/* ---------- shared checklist items ---------- */

const RX = {
  hypothesis: [/\bhypothes[ie](s|z)/i, /\bwe (propose|posit|predict|hypothesi[sz]e)\b/i, /\bcentral hypothesis\b/i, /\bresearch question\b/i],
  aims: [/\bspecific aims?\b/i, /\baim\s*\d/i, /\bobjectives?\b/i],
  preliminary: [/\bpreliminary (data|results|studies|findings|work)/i, /\bpilot (data|study)/i, /\bour (prior|previous) (work|studies)/i],
  sampleSize: [/\bpower (analysis|calculation|calculations)/i, /\bsample size/i, /\bpowered to\b/i, /\b80% power\b/i, /\bn\s*=\s*\d+/i],
  stats: [/\bstatistical (analysis|analyses|approach|plan|methods)/i, /\bmixed[- ]effects?/i, /\bregression\b/i, /\bANOVA\b/, /\bBayesian\b/i, /\bBonferroni|false discovery/i],
  blinding: [/\bblind(ed|ing)?\b/i, /\brandomi[sz](ed|ation)\b/i],
  rigor: [/\brigou?r\b/i, /\breproducib/i, /\breplicat/i],
  sex: [/\bbiological variable/i, /\bboth sexes/i, /\bmale and female/i, /\bsex[- ]and[- ]gender/i, /\bSGBA/i, /\bsex[- ]based/i, /\bsex differences?\b/i],
  pitfalls: [/\bpitfalls?\b/i, /\balternative (approach|strateg|explanation)/i, /\bpotential problems?\b/i, /\blimitations?\b/i, /\bcontingenc/i],
  timeline: [/\btimeline\b/i, /\bgantt\b/i, /\byear\s*[1-5]\b/i, /\bmonths?\s*\d+/i, /\bmilestones?\b/i],
  budget: [/\bbudget\b/i, /\bjustification\b/i, /\bpersonnel\b/i],
  ethics: [/\bIRB\b/, /\bREB\b/, /\bethics (board|committee|approval)/i, /\binformed consent/i, /\bIACUC\b/, /\banimal care\b/i, /\bhuman subjects?\b/i, /\bvertebrate animals?/i],
  dataSharing: [/\bdata (sharing|management|availability)/i, /\brepositor(y|ies)\b/i, /\bopen (access|science|data)/i, /\bdbGaP|GEO|SRA|Zenodo|Dryad|OSF\b/],
  letters: [/\bletters? of (support|collaboration|commitment)/i],
  team: [/\bco-?investigators?\b/i, /\bcollaborators?\b/i, /\bexpertise\b/i, /\btrack record\b/i],
  environment: [/\bfacilit(y|ies)\b/i, /\bcore (facility|facilities)\b/i, /\bresources?\b/i, /\bequipment\b/i, /\binstitutional (support|environment)/i],
  kt: [/\bknowledge (translation|mobilization|transfer)/i, /\bdissemination\b/i, /\bend[- ]users?\b/i, /\bstakeholders?\b/i],
  training: [/\btrainees?\b/i, /\bmentor(ing|ship)?\b/i, /\bgraduate students?\b/i, /\bpostdoc/i, /\bHQP\b/],
  edi: [/\bequity,? diversity,? (and )?inclusion/i, /\bEDI\b/, /\bunderrepresented\b/i, /\bIndigenous\b/],
  biohazard: [/\bbiohazard/i, /\bselect agents?\b/i, /\bbiosafety\b/i],
  authentication: [/\bauthenticat(e|ion)\b/i, /\bSTR profiling/i, /\bcell line/i, /\bvalidation of (key|biological)/i],
  inclusion: [/\binclusion of (women|minorities|children)/i, /\binclusion (plan|across the lifespan)/i, /\bunderrepresented/i],
  broaderImpacts: [/\bbroader impacts?\b/i, /\boutreach\b/i, /\bK-12\b/, /\bpublic engagement/i, /\bworkforce\b/i],
  intellectualMerit: [/\bintellectual merit/i],
  evaluation: [/\bevaluat(e|ion) (plan|of success)/i, /\bassess(ment)? (of )?success/i, /\bmetrics\b/i],
  patient: [/\bpatient (partners?|engagement|oriented)/i, /\blived experience/i, /\bcommunity (partners?|engagement)/i],
};

const CORE_CHECKS: ChecklistItemDef[] = [
  { id: 'hypothesis', label: 'Central hypothesis or research question is stated', category: 'science', patterns: RX.hypothesis },
  { id: 'aims', label: 'Aims or objectives are explicit and testable', category: 'science', patterns: RX.aims },
  { id: 'preliminary', label: 'Preliminary data support feasibility', category: 'science', patterns: RX.preliminary },
  { id: 'sampleSize', label: 'Sample size or power is justified', category: 'rigor', patterns: RX.sampleSize },
  { id: 'stats', label: 'Statistical analysis plan is described', category: 'rigor', patterns: RX.stats },
  { id: 'blinding', label: 'Randomisation or blinding is addressed', category: 'rigor', patterns: RX.blinding },
  { id: 'rigor', label: 'Rigor and reproducibility are addressed', category: 'rigor', patterns: RX.rigor },
  { id: 'pitfalls', label: 'Potential pitfalls and alternatives are discussed', category: 'rigor', patterns: RX.pitfalls },
  { id: 'timeline', label: 'Timeline with milestones is realistic', category: 'feasibility', patterns: RX.timeline },
  { id: 'team', label: 'Team has the expertise the aims require', category: 'feasibility', patterns: RX.team },
  { id: 'environment', label: 'Environment and resources are adequate', category: 'feasibility', patterns: RX.environment },
  { id: 'budget', label: 'Budget is justified and proportionate', category: 'feasibility', patterns: RX.budget },
  { id: 'ethics', label: 'Ethics approvals and protections are covered', category: 'compliance', patterns: RX.ethics },
  { id: 'dataSharing', label: 'Data sharing or management plan is present', category: 'compliance', patterns: RX.dataSharing },
];

const REVIEWER_CHECKS: ChecklistItemDef[] = [
  { id: 'r-coi', label: 'I have no conflict of interest with the applicants', category: 'reviewer', hint: 'Recent collaboration, shared institution, mentorship, financial ties.' },
  { id: 'r-whole', label: 'I read the entire application, including appendices', category: 'reviewer' },
  { id: 'r-criteria', label: 'Every criterion has a score and a written rationale', category: 'reviewer' },
  { id: 'r-evidence', label: 'Each weakness cites where in the application it arises', category: 'reviewer' },
  { id: 'r-tone', label: 'Comments are specific, constructive, and about the science', category: 'reviewer' },
  { id: 'r-consistent', label: 'Scores are consistent with the written critique', category: 'reviewer' },
  { id: 'r-confidential', label: 'I have not shared the application or used external AI tools on it', category: 'reviewer', hint: 'Most agencies prohibit uploading applications to third-party services.' },
];

/* ---------- NIH (simplified framework, 2025) ---------- */

const NIH_2025: Framework = {
  id: 'nih-2025',
  name: 'NIH Simplified Framework (2025)',
  agency: 'NIH',
  blurb: 'Three factors: Importance of the Research, Rigor and Feasibility, and Expertise and Resources. Overall Impact scored 1 to 9.',
  criterionScale: NIH_SCALE,
  criteria: [
    {
      id: 'importance',
      name: 'Factor 1: Importance of the Research',
      short: 'Importance',
      group: 'core',
      bulleted: true,
      keywords: ['significance', 'innovation', 'background', 'rationale', 'impact', 'premise'],
      description: 'Significance and Innovation. Does the project address an important problem, and does it use novel concepts, approaches, or methods?',
      prompts: [
        'Does the project address an important problem or a critical barrier to progress in the field?',
        'Is the scientific premise strong, with a clear rationale supported by prior work?',
        'If the aims are achieved, how will scientific knowledge, technical capability, or clinical practice improve?',
        'Does the project challenge current paradigms or use novel concepts, approaches, methodologies, or instrumentation?',
        'Is the innovation a refinement of existing approaches, or new to the field in a broad sense?',
      ],
    },
    {
      id: 'rigor',
      name: 'Factor 2: Rigor and Feasibility',
      short: 'Rigor & Feasibility',
      group: 'core',
      bulleted: true,
      keywords: ['approach', 'methods', 'design', 'analysis', 'preliminary', 'timeline', 'pitfalls', 'statistic'],
      description: 'Approach. Are the design, methods, and analyses well reasoned and appropriate? Is the work feasible within the timeline?',
      prompts: [
        'Are the overall strategy, methodology, and analyses well reasoned and appropriate for the aims?',
        'Does the plan address rigor: unbiased design, sample size, blinding, randomisation, and statistical power?',
        'Are potential problems, alternative strategies, and benchmarks for success presented?',
        'Do preliminary data support the feasibility of the aims?',
        'Are the aims interdependent so that failure of one blocks the rest?',
        'Is sex as a biological variable considered, and are relevant biological variables factored in?',
        'Is the timeline realistic given the scope of the work?',
      ],
    },
    {
      id: 'expertise',
      name: 'Factor 3: Expertise and Resources',
      short: 'Expertise & Resources',
      group: 'core',
      bulleted: true,
      keywords: ['investigator', 'environment', 'facilities', 'biosketch', 'team', 'resources'],
      description: 'Investigators and Environment. Rated as appropriate, or identify what additional expertise or resources would be needed.',
      scale: {
        kind: 'categorical',
        options: [
          { value: 'appropriate', label: 'Fully appropriate', hint: 'The team and environment are suited to the work.' },
          { value: 'additional', label: 'Additional expertise or resources needed', hint: 'Explain what is missing in the critique.' },
        ],
      },
      prompts: [
        'Do the investigators have the training, experience, and track record to carry out the work?',
        'For multi-PI projects, is the leadership plan sound and are complementary skills evident?',
        'Do the institutional environment and resources support the proposed science?',
        'Are letters of support, core facilities, and collaborators sufficient for specialised needs?',
      ],
    },
    {
      id: 'human-subjects',
      name: 'Protections for Human Subjects',
      short: 'Human subjects',
      group: 'additional',
      scale: ACCEPTABLE_SCALE,
      description: 'Risks to subjects, adequacy of protection against risks, potential benefits, and importance of the knowledge gained.',
      prompts: ['Are risks minimised and reasonable relative to benefits?', 'Is the data and safety monitoring plan adequate for clinical trials?'],
      keywords: ['human subjects', 'consent', 'IRB'],
    },
    {
      id: 'inclusion',
      name: 'Inclusion of Women, Minorities, and Individuals Across the Lifespan',
      short: 'Inclusion',
      group: 'additional',
      scale: ACCEPTABLE_SCALE,
      description: 'Are the plans for inclusion scientifically appropriate for the proposed research?',
      prompts: ['Is the proposed distribution of participants justified?', 'Are exclusions of any group scientifically justified?'],
      keywords: ['inclusion', 'women', 'minorities', 'lifespan'],
    },
    {
      id: 'animals',
      name: 'Vertebrate Animals',
      short: 'Animals',
      group: 'additional',
      scale: ACCEPTABLE_SCALE,
      description: 'Justification of species and numbers, minimisation of discomfort, and euthanasia methods.',
      prompts: ['Are the species and numbers justified?', 'Are pain, distress, and euthanasia adequately addressed?'],
      keywords: ['vertebrate', 'animal', 'IACUC', 'mice', 'rats'],
    },
    {
      id: 'biohazards',
      name: 'Biohazards',
      short: 'Biohazards',
      group: 'additional',
      scale: ACCEPTABLE_SCALE,
      description: 'Are materials or procedures potentially hazardous, and are protections adequate?',
      prompts: ['Are biohazards identified and are containment plans adequate?'],
      keywords: ['biohazard', 'biosafety'],
    },
    {
      id: 'budget',
      name: 'Budget and Period of Support',
      short: 'Budget',
      group: 'additional',
      scale: {
        kind: 'categorical',
        options: [
          { value: 'appropriate', label: 'Appropriate as requested' },
          { value: 'adjust', label: 'Adjustments recommended' },
        ],
      },
      description: 'Is the budget and requested period of support fully justified and reasonable in relation to the proposed research?',
      prompts: ['Are personnel effort and costs justified?', 'Is the period of support appropriate for the scope?'],
      keywords: ['budget', 'justification', 'personnel', 'effort'],
    },
  ],
  overall: {
    label: 'Overall Impact',
    description: 'The likelihood for the project to exert a sustained, powerful influence on the research field(s) involved, considering the three factors and additional criteria.',
    scale: NIH_SCALE,
  },
  checklist: [
    ...CORE_CHECKS,
    { id: 'sex', label: 'Sex as a biological variable is addressed', category: 'rigor', patterns: RX.sex },
    { id: 'authentication', label: 'Authentication of key biological or chemical resources', category: 'compliance', patterns: RX.authentication },
    { id: 'inclusion', label: 'Inclusion plan for human subjects (if applicable)', category: 'compliance', patterns: RX.inclusion },
    { id: 'biohazard', label: 'Biohazards or select agents are addressed (if applicable)', category: 'compliance', patterns: RX.biohazard },
    { id: 'letters', label: 'Letters of support are present for key collaborations', category: 'feasibility', patterns: RX.letters },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Score each factor independently; a weakness under one factor should not be double counted elsewhere.',
    'Overall Impact is a judgement, not an average of the factor scores.',
    'Bulleted strengths and weaknesses are the expected critique format. Lead with the points that drove your score.',
    'Reviewers may not use generative AI tools on the application. NIH treats this as a confidentiality breach.',
    'Do not penalise minor administrative issues; NIH staff handle compliance.',
  ],
  expectedSections: ['Specific Aims', 'Research Strategy', 'Significance', 'Innovation', 'Approach', 'Biographical Sketch', 'Facilities', 'Budget Justification', 'Human Subjects', 'Vertebrate Animals', 'Data Management and Sharing Plan', 'Letters of Support'],
};

/* ---------- NIH legacy five-criterion ---------- */

const NIH_LEGACY: Framework = {
  id: 'nih-legacy',
  name: 'NIH Five Criteria (pre-2025)',
  agency: 'NIH',
  blurb: 'Significance, Investigators, Innovation, Approach, and Environment each scored 1 to 9, plus Overall Impact.',
  criterionScale: NIH_SCALE,
  criteria: [
    {
      id: 'significance', name: 'Significance', short: 'Significance', group: 'core', bulleted: true,
      keywords: ['significance', 'background', 'impact', 'premise'],
      description: 'Does the project address an important problem or a critical barrier to progress?',
      prompts: ['Is the scientific premise strong?', 'How will successful completion change the concepts, methods, or practice of the field?'],
    },
    {
      id: 'investigators', name: 'Investigator(s)', short: 'Investigators', group: 'core', bulleted: true,
      keywords: ['investigator', 'biosketch', 'team', 'leadership'],
      description: 'Are the PD/PIs, collaborators, and other researchers well suited to the project?',
      prompts: ['Do they have appropriate experience and training?', 'For multi-PI, is the leadership plan appropriate?'],
    },
    {
      id: 'innovation', name: 'Innovation', short: 'Innovation', group: 'core', bulleted: true,
      keywords: ['innovation', 'novel'],
      description: 'Does the application challenge and seek to shift current paradigms?',
      prompts: ['Are the concepts, approaches, or methodologies novel to one field or in a broad sense?'],
    },
    {
      id: 'approach', name: 'Approach', short: 'Approach', group: 'core', bulleted: true,
      keywords: ['approach', 'methods', 'design', 'analysis', 'preliminary', 'timeline', 'pitfalls'],
      description: 'Are the strategy, methodology, and analyses well reasoned and appropriate?',
      prompts: ['Are potential problems and alternative strategies presented?', 'Is rigor addressed: blinding, randomisation, power, sex as a biological variable?', 'Is the timeline realistic?'],
    },
    {
      id: 'environment', name: 'Environment', short: 'Environment', group: 'core', bulleted: true,
      keywords: ['environment', 'facilities', 'resources'],
      description: 'Will the scientific environment contribute to the probability of success?',
      prompts: ['Are institutional support, equipment, and resources adequate?', 'Are collaborative arrangements evident?'],
    },
    NIH_2025.criteria.find((c) => c.id === 'human-subjects')!,
    NIH_2025.criteria.find((c) => c.id === 'inclusion')!,
    NIH_2025.criteria.find((c) => c.id === 'animals')!,
    NIH_2025.criteria.find((c) => c.id === 'biohazards')!,
    NIH_2025.criteria.find((c) => c.id === 'budget')!,
  ],
  overall: NIH_2025.overall,
  checklist: NIH_2025.checklist,
  guidance: NIH_2025.guidance,
  expectedSections: NIH_2025.expectedSections,
};

/* ---------- NSF ---------- */

const NSF: Framework = {
  id: 'nsf',
  name: 'NSF Merit Review',
  agency: 'NSF',
  blurb: 'Intellectual Merit and Broader Impacts, each judged through five review elements. Summary rating Excellent to Poor.',
  criterionScale: NSF_SCALE,
  criteria: [
    {
      id: 'merit', name: 'Intellectual Merit', short: 'Intellectual Merit', group: 'core', bulleted: true,
      keywords: ['intellectual merit', 'approach', 'methods', 'background', 'objectives', 'research plan'],
      description: 'The potential to advance knowledge and understanding within its own field or across different fields.',
      prompts: [
        'What is the potential for the proposed activity to advance knowledge?',
        'To what extent do the activities suggest and explore creative, original, or potentially transformative concepts?',
        'Is the plan well reasoned, well organised, based on sound rationale, and does it include a mechanism to assess success?',
        'How well qualified is the individual or team to conduct the activities?',
        'Are adequate resources available to the PI, either at the home organisation or through collaborations?',
      ],
    },
    {
      id: 'impacts', name: 'Broader Impacts', short: 'Broader Impacts', group: 'core', bulleted: true,
      keywords: ['broader impacts', 'outreach', 'education', 'workforce', 'society', 'diversity'],
      description: 'The potential to benefit society and contribute to the achievement of specific, desired societal outcomes.',
      prompts: [
        'What is the potential for the activity to benefit society or advance desired societal outcomes?',
        'Are the broader impact activities creative and original rather than boilerplate?',
        'Is the plan for broader impacts well reasoned, with a mechanism to assess success?',
        'Is the team qualified to carry out the broader impact activities?',
        'Are resources adequate for the broader impact activities?',
      ],
    },
    {
      id: 'solicitation', name: 'Solicitation-Specific Criteria', short: 'Solicitation', group: 'additional',
      keywords: ['solicitation'],
      scale: { kind: 'categorical', options: [{ value: 'met', label: 'Addressed' }, { value: 'partial', label: 'Partially addressed' }, { value: 'unmet', label: 'Not addressed' }, { value: 'na', label: 'None specified' }] },
      description: 'Any additional review criteria listed in the program solicitation.',
      prompts: ['Does the proposal address every additional criterion in the solicitation?'],
    },
    {
      id: 'dmp', name: 'Data Management Plan', short: 'Data Management', group: 'additional',
      keywords: ['data management'],
      scale: ACCEPTABLE_SCALE,
      description: 'Is the data management plan adequate and consistent with NSF policy on dissemination and sharing?',
      prompts: ['Are the types of data, standards, access policies, and archiving described?'],
    },
    {
      id: 'mentoring', name: 'Postdoctoral Mentoring Plan', short: 'Mentoring', group: 'additional',
      keywords: ['mentoring', 'postdoc'],
      scale: ACCEPTABLE_SCALE,
      description: 'If postdoctoral researchers are funded, is the mentoring plan adequate?',
      prompts: ['Are mentoring activities specific and meaningful?'],
    },
  ],
  overall: {
    label: 'Summary Rating',
    description: 'Your overall rating of the proposal, weighing both merit review criteria.',
    scale: NSF_SCALE,
  },
  checklist: [
    ...CORE_CHECKS,
    { id: 'intellectualMerit', label: 'Intellectual Merit is explicitly addressed', category: 'science', patterns: RX.intellectualMerit },
    { id: 'broaderImpacts', label: 'Broader Impacts are specific, not boilerplate', category: 'science', patterns: RX.broaderImpacts },
    { id: 'evaluation', label: 'A mechanism to assess success is described', category: 'rigor', patterns: RX.evaluation },
    { id: 'training', label: 'Student and postdoc training is described', category: 'feasibility', patterns: RX.training },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Address both Intellectual Merit and Broader Impacts separately; NSF program officers read them as distinct.',
    'Comment on results from prior NSF support when present.',
    'Write for the panel and the PI: your review is shared verbatim (anonymised) with the applicant.',
    'Do not upload proposal content to generative AI tools; NSF prohibits it.',
  ],
  expectedSections: ['Project Summary', 'Project Description', 'Intellectual Merit', 'Broader Impacts', 'Results from Prior NSF Support', 'References Cited', 'Biographical Sketch', 'Budget Justification', 'Facilities, Equipment and Other Resources', 'Data Management Plan', 'Postdoctoral Mentoring Plan'],
};

/* ---------- CIHR Project Grant ---------- */

const CIHR: Framework = {
  id: 'cihr-project',
  name: 'CIHR Project Grant',
  agency: 'CIHR',
  blurb: 'Concept (quality and importance of the idea) and Feasibility (approach, expertise, experience, and resources). Overall rating 0 to 4.9.',
  criterionScale: CIHR_DESCRIPTORS,
  criteria: [
    {
      id: 'quality', name: 'Concept: Quality of the Idea', short: 'Quality of Idea', group: 'core', bulleted: true,
      keywords: ['rationale', 'background', 'hypothesis', 'objective', 'originality', 'innovative'],
      description: 'Is the idea original, well defined, and does it contribute to new knowledge?',
      prompts: [
        'Is the research question or hypothesis clearly defined and justified?',
        'Is the idea original, innovative, or does it challenge existing paradigms?',
        'Does the proposal build on a solid foundation of existing knowledge and, where available, preliminary data?',
      ],
    },
    {
      id: 'importance', name: 'Concept: Importance of the Idea', short: 'Importance', group: 'core', bulleted: true,
      keywords: ['significance', 'impact', 'health', 'importance', 'burden'],
      description: 'Significance of the potential contribution to health, the health system, or health outcomes.',
      prompts: [
        'How significant is the potential contribution to advancing health-related knowledge, research, care, systems, or outcomes?',
        'Is the potential impact plausible within a reasonable time horizon?',
        'Is the research relevant to Canadian or global health priorities?',
      ],
    },
    {
      id: 'approach', name: 'Feasibility: Approach', short: 'Approach', group: 'core', bulleted: true,
      keywords: ['approach', 'methods', 'design', 'analysis', 'timeline', 'knowledge translation', 'sex', 'gender'],
      description: 'Are the methods appropriate, and can the project be delivered as described?',
      prompts: [
        'Are the study design, methods, and analysis plan appropriate and robust?',
        'Is sample size justified, and are sex and gender considerations integrated where relevant?',
        'Are timelines, milestones, and the plan to manage risks realistic?',
        'Is the knowledge translation or dissemination plan appropriate?',
        'Are potential challenges and mitigation strategies described?',
      ],
    },
    {
      id: 'expertise', name: 'Feasibility: Expertise, Experience and Resources', short: 'Expertise & Resources', group: 'core', bulleted: true,
      keywords: ['applicant', 'team', 'expertise', 'environment', 'resources', 'budget', 'CV', 'track record'],
      description: 'Do the applicants and environment provide what the project needs, and is the budget appropriate?',
      prompts: [
        'Does the team have the necessary expertise and track record, including for any interdisciplinary elements?',
        'Are the roles and contributions of team members clear?',
        'Are the environment, resources, and partnerships adequate?',
        'Is the budget appropriate and well justified? Recommend adjustments if not.',
      ],
    },
    {
      id: 'budget', name: 'Budget Appropriateness', short: 'Budget', group: 'additional',
      keywords: ['budget'],
      scale: { kind: 'categorical', options: [{ value: 'appropriate', label: 'Appropriate as requested' }, { value: 'reduce', label: 'Recommend reduction' }, { value: 'unjustified', label: 'Insufficiently justified' }] },
      description: 'CIHR asks reviewers to assess whether the requested budget is appropriate and to recommend changes.',
      prompts: ['Are all line items justified by the research plan?'],
    },
    {
      id: 'sgba', name: 'Sex- and Gender-Based Analysis Plus', short: 'SGBA+', group: 'additional',
      keywords: ['sex', 'gender', 'SGBA'],
      scale: { kind: 'categorical', options: [{ value: 'integrated', label: 'Appropriately integrated' }, { value: 'partial', label: 'Partially addressed' }, { value: 'absent', label: 'Not addressed' }, { value: 'na', label: 'Not applicable with justification' }] },
      description: 'Have sex, gender, and other intersecting factors been appropriately considered in the design?',
      prompts: ['Is the justification for including or excluding sex and gender analysis sound?'],
    },
  ],
  overall: {
    label: 'Overall Rating',
    description: 'A single rating from 0 to 4.9 reflecting your assessment of the application as a whole.',
    scale: {
      kind: 'numeric',
      min: 0,
      max: 4.9,
      step: 0.1,
      bestIsLow: false,
      labels: { 4.5: 'Outstanding', 4.0: 'Excellent', 3.5: 'Very Good', 3.0: 'Good', 2.5: 'Fair', 2.0: 'Poor', 0: 'Not acceptable' },
      hint: '4.9 is best. Applications rated below 3.5 are rarely funded.',
    },
  },
  checklist: [
    ...CORE_CHECKS,
    { id: 'sex', label: 'Sex and gender considerations (SGBA+) are integrated', category: 'rigor', patterns: RX.sex },
    { id: 'kt', label: 'Knowledge translation or dissemination plan is present', category: 'science', patterns: RX.kt },
    { id: 'patient', label: 'Patient, community, or Indigenous engagement where relevant', category: 'science', patterns: RX.patient },
    { id: 'training', label: 'Training and mentoring of HQP is described', category: 'feasibility', patterns: RX.training },
    { id: 'edi', label: 'EDI considerations in the research team and design', category: 'compliance', patterns: RX.edi },
    { id: 'letters', label: 'Letters of collaboration are included for partners', category: 'feasibility', patterns: RX.letters },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Rate the application, not the applicants: assess the science and its feasibility.',
    'Your written review should let the applicants understand why the rating was given.',
    'Consider the budget explicitly and recommend adjustments when justified.',
    'Do not use generative AI tools to evaluate or write about the application; CIHR prohibits it.',
    'Applications from early career researchers should be assessed with the same standards but with attention to opportunity.',
  ],
  expectedSections: ['Summary of Research Proposal', 'Research Proposal', 'Background', 'Objectives', 'Methods', 'Sex and Gender', 'Knowledge Translation', 'Timeline', 'Budget', 'Budget Justification', 'References', 'CV', 'Letters of Collaboration', 'Most Significant Contributions'],
};

/* ---------- ERC ---------- */

const ERC_SCALE: ScaleDef = {
  kind: 'categorical',
  options: [
    { value: 'excellent', label: 'Excellent', hint: 'Fully meets the ERC excellence criterion.' },
    { value: 'very-good', label: 'Very Good', hint: 'Meets the criterion to a large extent.' },
    { value: 'non-competitive', label: 'Non-competitive', hint: 'Does not meet the criterion sufficiently.' },
  ],
};

const ERC: Framework = {
  id: 'erc',
  name: 'ERC Frontier Grant',
  agency: 'ERC',
  blurb: 'Excellence is the sole criterion, assessed for the research project and the principal investigator.',
  criterionScale: ERC_SCALE,
  criteria: [
    {
      id: 'project', name: 'Research Project', short: 'Project', group: 'core', bulleted: true,
      keywords: ['project', 'objectives', 'methodology', 'state of the art', 'work package'],
      description: 'Ground-breaking nature, ambition, and feasibility of the proposed research.',
      prompts: [
        'To what extent does the research address important challenges at the frontiers of the field?',
        'Are the objectives ambitious and beyond the state of the art, with high gain and high risk balanced?',
        'Is the methodology appropriate, and does it consider alternatives if the approach fails?',
        'Are the timescales and resources necessary and properly justified?',
      ],
    },
    {
      id: 'pi', name: 'Principal Investigator', short: 'PI', group: 'core', bulleted: true,
      keywords: ['track record', 'CV', 'principal investigator', 'publications'],
      description: 'Intellectual capacity, creativity, and commitment of the PI.',
      prompts: [
        'Does the track record show the ability to propose and conduct ground-breaking research?',
        'Is there evidence of creative, independent thinking?',
        'Does the PI demonstrate the commitment and time to carry out the project?',
      ],
    },
    {
      id: 'ethics', name: 'Ethics and Security', short: 'Ethics', group: 'additional',
      keywords: ['ethics'],
      scale: ACCEPTABLE_SCALE,
      description: 'Any ethical issues raised in the ethics self-assessment.',
      prompts: ['Are ethical issues identified and adequately addressed?'],
    },
  ],
  overall: {
    label: 'Overall Recommendation',
    description: 'Your recommendation on whether the proposal should be retained for the next step or funded.',
    scale: {
      kind: 'categorical',
      options: [
        { value: 'A', label: 'A: fully meets excellence criterion, recommended for funding' },
        { value: 'B', label: 'B: meets some elements, not recommended for funding' },
        { value: 'C', label: 'C: does not meet the excellence criterion' },
      ],
    },
  },
  checklist: [
    ...CORE_CHECKS,
    { id: 'training', label: 'Team composition and roles are described', category: 'feasibility', patterns: RX.training },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Assess excellence only. Do not weigh societal relevance unless it bears on scientific excellence.',
    'High-risk, high-gain proposals should not be penalised for risk alone if the approach is credible.',
    'Comment on both the project and the PI separately; panels read each.',
  ],
  expectedSections: ['Extended Synopsis', 'Curriculum Vitae', 'Track Record', 'Scientific Proposal', 'State of the Art and Objectives', 'Methodology', 'Resources', 'Ethics'],
};

/* ---------- Generic ---------- */

const GENERIC: Framework = {
  id: 'generic',
  name: 'General Research Grant',
  agency: 'Any',
  blurb: 'A balanced six-criterion rubric on a 1 to 5 scale for agencies or foundations without a fixed template.',
  criterionScale: FIVE_POINT,
  criteria: [
    { id: 'significance', name: 'Significance', short: 'Significance', group: 'core', bulleted: true, keywords: ['significance', 'background', 'impact'], description: 'Importance of the problem and potential impact of the results.', prompts: ['Why does this matter, and to whom?', 'What changes if the project succeeds?'] },
    { id: 'novelty', name: 'Novelty and Innovation', short: 'Novelty', group: 'core', bulleted: true, keywords: ['innovation', 'novel'], description: 'Originality of the concepts, methods, or applications.', prompts: ['What is new here compared to the state of the art?'] },
    { id: 'approach', name: 'Approach and Rigor', short: 'Approach', group: 'core', bulleted: true, keywords: ['approach', 'methods', 'design', 'analysis'], description: 'Soundness of the design, methods, and analysis plan.', prompts: ['Are methods appropriate and adequately detailed?', 'Are sample size, controls, and analysis justified?', 'Are pitfalls and alternatives discussed?'] },
    { id: 'feasibility', name: 'Feasibility', short: 'Feasibility', group: 'core', bulleted: true, keywords: ['timeline', 'preliminary', 'milestone'], description: 'Likelihood the work can be completed as proposed.', prompts: ['Do preliminary data and the timeline support delivery?'] },
    { id: 'team', name: 'Team and Environment', short: 'Team', group: 'core', bulleted: true, keywords: ['team', 'investigator', 'environment', 'resources'], description: 'Expertise, track record, and institutional resources.', prompts: ['Does the team cover every skill the aims require?'] },
    { id: 'budget', name: 'Budget and Value', short: 'Budget', group: 'core', bulleted: true, keywords: ['budget'], description: 'Appropriateness and justification of the requested resources.', prompts: ['Is every major cost tied to an aim?'] },
  ],
  overall: {
    label: 'Overall Score',
    description: 'Your overall assessment of the proposal.',
    scale: FIVE_POINT,
  },
  recommendations: ['Fund', 'Fund with revisions', 'Do not fund'],
  checklist: [
    ...CORE_CHECKS,
    { id: 'kt', label: 'Dissemination plan is described', category: 'science', patterns: RX.kt },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Separate what the proposal says from what you wish it said; review the document in front of you.',
    'Give the applicant enough detail to act on every weakness.',
  ],
  expectedSections: ['Abstract', 'Summary', 'Background', 'Aims', 'Objectives', 'Methods', 'Approach', 'Timeline', 'Budget', 'References', 'Team'],
};

/* ---------- Horizon Europe ---------- */

const HE_SCALE: ScaleDef = {
  kind: 'numeric',
  min: 0,
  max: 5,
  step: 0.5,
  bestIsLow: false,
  labels: { 0: 'Fails to address the criterion', 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' },
  hint: '5 is best. Threshold 3 per criterion; 10 overall. Half points allowed.',
};

const HORIZON: Framework = {
  id: 'horizon-europe',
  name: 'Horizon Europe (RIA / IA)',
  agency: 'EU',
  blurb: 'Excellence, Impact, and Quality and efficiency of the implementation, each scored 0 to 5 with a threshold of 3; overall threshold 10 of 15.',
  criterionScale: HE_SCALE,
  criteria: [
    {
      id: 'excellence', name: 'Excellence', short: 'Excellence', group: 'core', bulleted: true,
      keywords: ['objectives', 'ambition', 'methodology', 'state of the art', 'concept', 'interdisciplinary', 'gender dimension', 'open science'],
      description: 'Clarity and pertinence of the objectives, soundness of the methodology, and the ambition beyond the state of the art.',
      prompts: [
        'Are the objectives clear, pertinent, and measurable?',
        'Is the proposed work ambitious and beyond the state of the art?',
        'Is the methodology sound, including interdisciplinary approaches, the gender dimension, and open science practices where relevant?',
        'Are the scientific and technological risks and their mitigation credible?',
      ],
    },
    {
      id: 'impact', name: 'Impact', short: 'Impact', group: 'core', bulleted: true,
      keywords: ['impact', 'outcomes', 'dissemination', 'exploitation', 'communication', 'pathway'],
      description: 'Credibility of the pathways to the expected outcomes and impacts, and the measures to maximise them.',
      prompts: [
        'Is the pathway to the expected outcomes and impacts of the call credible?',
        'Are dissemination, exploitation, and communication measures suitable and proportionate?',
        'Is the scale and significance of the contribution to the expected impacts convincing?',
      ],
    },
    {
      id: 'implementation', name: 'Quality and efficiency of the implementation', short: 'Implementation', group: 'core', bulleted: true,
      keywords: ['work plan', 'work package', 'consortium', 'management', 'resources', 'risk', 'gantt', 'deliverables', 'milestones'],
      description: 'Quality of the work plan, appropriateness of resources, and the capacity and role of each participant.',
      prompts: [
        'Are the work plan, work packages, milestones, and deliverables coherent and effective?',
        'Are the allocated resources appropriate and justified?',
        'Does the consortium have the necessary capacity and complementary expertise?',
        'Is the risk management plan adequate?',
      ],
    },
  ],
  overall: {
    label: 'Total score',
    description: 'Sum of the three criterion scores (0 to 15). Proposals must reach 3 on each criterion and 10 overall.',
    scale: { kind: 'numeric', min: 0, max: 15, step: 0.5, bestIsLow: false, labels: { 13: 'Very strong', 10: 'Above threshold', 0: 'Below threshold' }, hint: '15 is best.' },
  },
  checklist: [
    ...CORE_CHECKS,
    { id: 'evaluation', label: 'Measurable objectives and success indicators', category: 'rigor', patterns: RX.evaluation },
    { id: 'kt', label: 'Dissemination, exploitation, and communication plan', category: 'science', patterns: RX.kt },
    { id: 'edi', label: 'Gender dimension and inclusiveness considered', category: 'compliance', patterns: [/gender (dimension|equality|balance)/i, ...RX.edi] },
    { id: 'dataSharing', label: 'Open science and data management practices', category: 'compliance', patterns: RX.dataSharing },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Score each criterion independently against the call text; thresholds apply per criterion and to the total.',
    'Comments should justify the score and be usable in the Evaluation Summary Report.',
    'Do not reward proposals for content outside the scope of the topic.',
  ],
  expectedSections: ['Excellence', 'Impact', 'Implementation', 'Objectives', 'Methodology', 'Work plan', 'Work packages', 'Consortium', 'Resources', 'Risk'],
};

/* ---------- NSERC Discovery ---------- */

const NSERC_SCALE: ScaleDef = {
  kind: 'categorical',
  options: [
    { value: 'exceptional', label: 'Exceptional' },
    { value: 'outstanding', label: 'Outstanding' },
    { value: 'very-strong', label: 'Very Strong' },
    { value: 'strong', label: 'Strong' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'insufficient', label: 'Insufficient' },
  ],
};

const NSERC: Framework = {
  id: 'nserc-discovery',
  name: 'NSERC Discovery Grant',
  agency: 'NSERC',
  blurb: 'Three equally weighted criteria: excellence of the researcher, merit of the proposal, and contribution to the training of highly qualified personnel (HQP).',
  criterionScale: NSERC_SCALE,
  criteria: [
    {
      id: 'researcher', name: 'Excellence of the Researcher', short: 'Researcher', group: 'core', bulleted: true,
      keywords: ['contributions', 'publications', 'track record', 'CV', 'applicant'],
      description: 'Knowledge, expertise, and experience; quality of contributions to research and their impact.',
      prompts: ['How significant are the applicant\'s contributions over the past six years?', 'Is there evidence of impact and leadership in the field?', 'Are contributions assessed in context, including career interruptions?'],
    },
    {
      id: 'merit', name: 'Merit of the Proposal', short: 'Proposal', group: 'core', bulleted: true,
      keywords: ['objectives', 'methodology', 'originality', 'feasibility', 'budget', 'long-term'],
      description: 'Originality and innovation, clarity of objectives, feasibility, and the relationship between the program and the budget.',
      prompts: ['Are the long-term vision and short-term objectives clear and coherent?', 'Is the methodology appropriate and feasible?', 'Is the program original and innovative?', 'Is the budget justified in relation to the program?'],
    },
    {
      id: 'hqp', name: 'Contribution to the Training of HQP', short: 'HQP Training', group: 'core', bulleted: true,
      keywords: ['training', 'HQP', 'students', 'trainees', 'mentor', 'EDI'],
      description: 'Quality of past and proposed training, including the training environment and equity, diversity, and inclusion practices.',
      prompts: ['What is the quality and impact of past HQP training?', 'Is the proposed training plan appropriate for the program?', 'Are EDI considerations integrated into recruitment and training?'],
    },
  ],
  overall: {
    label: 'Overall assessment',
    description: 'The combination of the three criterion ratings that determines the funding bin.',
    scale: NSERC_SCALE,
  },
  checklist: [
    ...CORE_CHECKS,
    { id: 'training', label: 'HQP training plan is specific and appropriate', category: 'feasibility', patterns: RX.training },
    { id: 'edi', label: 'EDI considerations in training and team', category: 'compliance', patterns: RX.edi },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Rate each criterion independently; NSERC combines them into a funding bin.',
    'Assess the program of research, not a single project; Discovery Grants support long-term programs.',
    'Consider contributions in context, including career stage and interruptions.',
  ],
  expectedSections: ['Summary', 'Proposal', 'Objectives', 'Methodology', 'Budget', 'Training', 'HQP', 'Contributions', 'Most Significant Contributions'],
};

/* ---------- NHMRC Ideas Grant ---------- */

const NHMRC_SCALE: ScaleDef = {
  kind: 'numeric',
  min: 1,
  max: 7,
  bestIsLow: false,
  labels: { 7: 'Exceptional', 6: 'Outstanding', 5: 'Excellent', 4: 'Very good', 3: 'Good', 2: 'Satisfactory', 1: 'Unsatisfactory' },
  hint: '7 is best.',
};

const NHMRC: Framework = {
  id: 'nhmrc-ideas',
  name: 'NHMRC Ideas Grant',
  agency: 'NHMRC',
  blurb: 'Research Quality (50%), Innovation and Creativity (25%), and Significance (25%), each scored 1 to 7.',
  criterionScale: NHMRC_SCALE,
  criteria: [
    {
      id: 'quality', name: 'Research Quality (50%)', short: 'Quality', group: 'core', bulleted: true,
      keywords: ['design', 'methods', 'feasibility', 'approach', 'analysis', 'team'],
      description: 'Scientific quality of the design and methods, feasibility, and the team\'s capacity to deliver.',
      prompts: ['Is the design appropriate and rigorous?', 'Is the project feasible within the timeframe and budget?', 'Does the team have the capability to deliver?'],
    },
    {
      id: 'innovation', name: 'Innovation and Creativity (25%)', short: 'Innovation', group: 'core', bulleted: true,
      keywords: ['innovative', 'novel', 'creative', 'original'],
      description: 'Novelty of the idea, approach, or technology.',
      prompts: ['Is the idea, approach, or technology genuinely novel?', 'Does it challenge existing paradigms?'],
    },
    {
      id: 'significance', name: 'Significance (25%)', short: 'Significance', group: 'core', bulleted: true,
      keywords: ['significance', 'impact', 'health', 'burden'],
      description: 'Potential to improve health and to advance knowledge.',
      prompts: ['What is the potential contribution to health outcomes?', 'How significant is the advance in knowledge?'],
    },
  ],
  overall: {
    label: 'Overall score',
    description: 'Weighted overall assessment on the 1 to 7 scale.',
    scale: NHMRC_SCALE,
  },
  checklist: [...CORE_CHECKS, { id: 'sex', label: 'Sex and gender considered', category: 'rigor', patterns: RX.sex }, ...REVIEWER_CHECKS],
  guidance: ['Apply the weightings: Research Quality carries half the score.', 'Scores of 5 or above indicate a fundable proposal; justify scores at either extreme.'],
  expectedSections: ['Synopsis', 'Research Proposal', 'Background', 'Aims', 'Research Plan', 'Methods', 'Timeline', 'Budget', 'Team', 'Significance'],
};

/* ---------- Wellcome ---------- */

const WELLCOME_SCALE: ScaleDef = {
  kind: 'categorical',
  options: [
    { value: 'exceptional', label: 'Exceptional' },
    { value: 'excellent', label: 'Excellent' },
    { value: 'very-good', label: 'Very good' },
    { value: 'good', label: 'Good' },
    { value: 'weak', label: 'Weak' },
  ],
};

const WELLCOME: Framework = {
  id: 'wellcome',
  name: 'Wellcome Discovery Award',
  agency: 'Wellcome',
  blurb: 'Research question and proposal, the applicant and team, and the research environment. Confirm the descriptors against the scheme guidance for your call.',
  criterionScale: WELLCOME_SCALE,
  criteria: [
    {
      id: 'question', name: 'Research question and proposal', short: 'Proposal', group: 'core', bulleted: true,
      keywords: ['question', 'vision', 'approach', 'methods', 'significance', 'bold'],
      description: 'Importance and boldness of the research question and the quality and feasibility of the proposed approach.',
      prompts: ['Is the question important and does it have the potential to transform understanding?', 'Is the approach well designed, feasible, and appropriately ambitious?', 'Are potential risks recognised with credible mitigation?'],
    },
    {
      id: 'team', name: 'Applicant and team', short: 'Team', group: 'core', bulleted: true,
      keywords: ['applicant', 'team', 'track record', 'leadership', 'expertise'],
      description: 'Suitability of the applicant and team to deliver the proposal, including research culture and leadership.',
      prompts: ['Does the team have the expertise and experience to deliver?', 'Is there evidence of a positive research culture and of developing others?'],
    },
    {
      id: 'environment', name: 'Research environment', short: 'Environment', group: 'core', bulleted: true,
      keywords: ['environment', 'institution', 'facilities', 'support', 'resources'],
      description: 'Adequacy of the host environment, facilities, and institutional support.',
      prompts: ['Are the facilities and institutional support adequate?', 'Are collaborations and access to resources secured?'],
    },
    {
      id: 'budget', name: 'Resources requested', short: 'Budget', group: 'additional',
      keywords: ['budget', 'costs'],
      scale: { kind: 'categorical', options: [{ value: 'appropriate', label: 'Appropriate' }, { value: 'reduce', label: 'Reduction advised' }, { value: 'unjustified', label: 'Insufficiently justified' }] },
      description: 'Are the requested resources appropriate and justified?',
      prompts: ['Are costs proportionate to the work?'],
    },
  ],
  overall: { label: 'Overall assessment', description: 'Your overall recommendation for the proposal.', scale: WELLCOME_SCALE },
  checklist: [...CORE_CHECKS, { id: 'training', label: 'Research culture and development of team members', category: 'feasibility', patterns: RX.training }, { id: 'dataSharing', label: 'Open research and data sharing plan', category: 'compliance', patterns: RX.dataSharing }, ...REVIEWER_CHECKS],
  guidance: ['Focus on the potential of the idea and the people; Wellcome asks reviewers to value boldness.', 'Comment on research culture and the applicant\'s contribution to it.'],
  expectedSections: ['Research question', 'Proposal', 'Approach', 'Vision', 'Team', 'Environment', 'Costs', 'Budget'],
};

/* ---------- UKRI (MRC style) ---------- */

const UKRI_SCALE: ScaleDef = {
  kind: 'numeric',
  min: 1,
  max: 6,
  bestIsLow: false,
  labels: { 6: 'Exceptional', 5: 'Excellent', 4: 'Very good', 3: 'Good', 2: 'Fair', 1: 'Poor' },
  hint: '6 is best. Confirm the scale in your council\'s reviewer guidance.',
};

const UKRI: Framework = {
  id: 'ukri',
  name: 'UKRI research grant (MRC style)',
  agency: 'UKRI',
  blurb: 'Importance, scientific potential, resources and management, and value for money. Adapt the scale to your council\'s reviewer guidance.',
  criterionScale: UKRI_SCALE,
  criteria: [
    {
      id: 'importance', name: 'Importance', short: 'Importance', group: 'core', bulleted: true,
      keywords: ['importance', 'significance', 'need', 'impact', 'background'],
      description: 'How important are the questions, and how will the work advance the field or health?',
      prompts: ['How significant are the questions addressed?', 'What is the likely contribution to knowledge, health, or society?'],
    },
    {
      id: 'potential', name: 'Scientific potential', short: 'Potential', group: 'core', bulleted: true,
      keywords: ['design', 'methods', 'approach', 'feasibility', 'preliminary', 'analysis'],
      description: 'Quality of the design and methods, feasibility, and the applicants\' ability to deliver.',
      prompts: ['Are the design and methods appropriate and rigorous?', 'Are sample sizes and analyses justified?', 'Do the applicants have the track record to deliver?'],
    },
    {
      id: 'resources', name: 'Resources and management', short: 'Resources', group: 'core', bulleted: true,
      keywords: ['budget', 'resources', 'management', 'timeline', 'environment', 'staff'],
      description: 'Appropriateness of resources, staffing, environment, and project management.',
      prompts: ['Are the requested resources appropriate and justified?', 'Is the project management and timeline realistic?'],
    },
    {
      id: 'value', name: 'Value for money', short: 'Value', group: 'additional',
      keywords: ['value', 'cost'],
      scale: { kind: 'categorical', options: [{ value: 'good', label: 'Good value' }, { value: 'acceptable', label: 'Acceptable' }, { value: 'poor', label: 'Poor value' }] },
      description: 'Does the likely benefit justify the cost?',
      prompts: ['Could the same outcomes be achieved at lower cost?'],
    },
  ],
  overall: { label: 'Overall score', description: 'Your overall score for the proposal.', scale: UKRI_SCALE },
  checklist: [...CORE_CHECKS, { id: 'dataSharing', label: 'Data management and sharing plan', category: 'compliance', patterns: RX.dataSharing }, { id: 'kt', label: 'Pathways to impact or dissemination', category: 'science', patterns: RX.kt }, ...REVIEWER_CHECKS],
  guidance: ['Comment on each criterion separately; panels read the criterion comments alongside the score.', 'Value for money is judged against the likely outcomes, not the absolute cost.'],
  expectedSections: ['Case for Support', 'Importance', 'Background', 'Aims', 'Objectives', 'Methods', 'Experimental design', 'Justification of resources', 'Data management plan', 'Pathways to impact'],
};

/* ---------- DFG ---------- */

const DFG_SCALE: ScaleDef = {
  kind: 'categorical',
  options: [
    { value: 'excellent', label: 'Excellent' },
    { value: 'very-good', label: 'Very good' },
    { value: 'good', label: 'Good' },
    { value: 'satisfactory', label: 'Satisfactory' },
    { value: 'not-fundable', label: 'Not fundable' },
  ],
};

const DFG: Framework = {
  id: 'dfg',
  name: 'DFG Research Grant (Sachbeihilfe)',
  agency: 'DFG',
  blurb: 'Quality and originality of the project, qualifications of the applicant, and the work programme and feasibility, leading to a funding recommendation.',
  criterionScale: DFG_SCALE,
  criteria: [
    {
      id: 'project', name: 'Quality of the project', short: 'Project', group: 'core', bulleted: true,
      keywords: ['objectives', 'state of the art', 'originality', 'significance', 'hypothesis'],
      description: 'Scientific quality, originality, and significance of the objectives in relation to the state of the art.',
      prompts: ['Are the objectives original and scientifically significant?', 'Is the project well grounded in the state of the art?'],
    },
    {
      id: 'applicant', name: 'Qualifications of the applicant', short: 'Applicant', group: 'core', bulleted: true,
      keywords: ['applicant', 'publications', 'preliminary', 'track record'],
      description: 'Expertise and preliminary work that qualify the applicant to carry out the project.',
      prompts: ['Do the applicant\'s prior work and preliminary results support the project?'],
    },
    {
      id: 'programme', name: 'Work programme and feasibility', short: 'Work programme', group: 'core', bulleted: true,
      keywords: ['work programme', 'methods', 'timeline', 'feasibility', 'resources', 'budget'],
      description: 'Appropriateness and feasibility of the work programme, methods, timeline, and requested funds.',
      prompts: ['Are the methods and timeline realistic?', 'Are the requested funds necessary and justified?'],
    },
  ],
  overall: { label: 'Funding recommendation', description: 'Your recommendation to the DFG.', scale: DFG_SCALE },
  checklist: [...CORE_CHECKS, { id: 'dataSharing', label: 'Handling of research data described', category: 'compliance', patterns: RX.dataSharing }, ...REVIEWER_CHECKS],
  guidance: ['Give a clear funding recommendation and the reasons for it.', 'Comment on the requested funds; the DFG asks whether they are appropriate.'],
  expectedSections: ['State of the art', 'Preliminary work', 'Objectives', 'Work programme', 'Methods', 'Handling of research data', 'Requested modules', 'Funding'],
};

/* ---------- HDSA (Human Biology Project / Human Experience Project) ---------- */

/** HDSA's ProposalCentral score: 1 is best; 1 to 4 has historically been fundable. */
const HDSA_SCALE: ScaleDef = {
  kind: 'numeric',
  min: 1,
  max: 9,
  bestIsLow: true,
  labels: {
    1: 'Outstanding',
    2: 'Historically fundable',
    3: 'Historically fundable',
    4: 'Historically fundable',
    5: 'Historically not funded',
    6: 'Historically not funded',
    7: 'Historically not funded',
    8: 'Historically not funded',
    9: 'Poor',
  },
  hint: '1 is outstanding, 9 is poor. Applications scoring 1 to 4 have historically been considered fundable by the SAB.',
};

const HDSA: Framework = {
  id: 'hdsa',
  name: 'HDSA Human Biology / Human Experience Project',
  agency: 'HDSA',
  blurb:
    'Mirrors the ProposalCentral score sheet: a summary, comments on five criteria in order of importance (impact, scientific approach, feasibility, strength of candidate and mentor lab, clinical collaboration), other comments, whether the application merits discussion by the full SAB, feedback for the applicant, and one overall score from 1 (outstanding) to 9 (poor). Criteria are not scored individually; each comment box holds 2,000 characters.',
  criterionScale: HDSA_SCALE,
  form: {
    summary: {
      label: 'Comments: Summary',
      hint: 'Summarize the grant and offer your comments on its eligibility for funding. The major criteria, in order of importance, are impact, scientific approach, feasibility, strength of candidate and mentor lab, and clinical collaboration. You may wish to complete the criterion boxes first and summarize last.',
      maxChars: 2000,
      required: true,
    },
    additional: {
      label: 'Comments: Other',
      hint: 'Other comments, questions, considerations, or concerns.',
      maxChars: 2000,
      required: true,
    },
    overallComment: {
      label: 'Feedback for the applicant',
      hint: 'Specific comments or feedback for the applicant. These need not be extensive, but points on how you weighed the scoring criteria and what you liked or disliked let HDSA give applicants useful feedback. If you are comfortable with the applicant seeing the full extent of your comments, you may paste them in full.',
      maxChars: 15000,
      required: true,
    },
    recommendation: {
      label: 'Worthy of discussion?',
      hint: 'Should this application be discussed amongst the full SAB during the review meeting?',
      required: true,
    },
  },
  criteria: [
    {
      id: 'impact', name: 'Impact', short: 'Impact', group: 'core', bulleted: true, unscored: true, maxChars: 2000,
      keywords: ['significance', 'impact', 'relevance', 'background', 'rationale', 'statement of need', 'gap', 'biomarker'],
      description: 'Does the proposal help us better understand HD human biology or address a critical issue within the HD research community? For example, does it emphasize biomarkers, mechanistic insights, or endpoints that will support therapy development?',
      prompts: [
        'Does the project address an important problem in HD biology, or a meaningful gap in the lived experience of HD?',
        'Will the findings inform therapeutic development, clinical trial design, regulatory arguments, or patient care?',
        'Does it develop or validate clinically meaningful biomarkers or endpoints, including treatment response and progression across HD-ISS stages?',
        'Does it offer mechanistic insight grounded in human biology rather than only in models?',
        'Human Experience: will findings improve cognition, function, quality of life, or care across disease stages?',
        'Does it address HDSA priorities: supporting people as disease-modifying therapies emerge, patient-centered outcome measures, or equity of access for rural and underserved communities?',
      ],
    },
    {
      id: 'approach', name: 'Scientific Approach', short: 'Approach', group: 'core', bulleted: true, unscored: true, maxChars: 2000,
      keywords: ['approach', 'methods', 'design', 'analysis', 'outcome measures', 'statistic', 'aims', 'research plan', 'iPSC', 'samples'],
      description: 'Are the methods and technologies appropriate to address the question? Does the proposal use clinical samples or patient data to advance understanding of HD biology in humans? iPSC-based studies must be clearly linked to human clinical relevance and framed in the context of findings from patient samples.',
      prompts: [
        'Are the design, methods, and analyses rigorous and appropriate to the aims?',
        'Does the work use HD patient-derived samples or data (biofluids, CSF, PBMCs, postmortem tissue) rather than only cell lines or animal material?',
        'If iPSC-based: is it explicitly tied to human clinical relevance and to findings from patient samples?',
        'Is the study population well defined, with sufficient statistical power or a justified pilot design and a credible plan to scale up?',
        'Human Experience: are the outcome measures patient-centered and relevant to clinical trials or regulatory submissions?',
        'Are potential pitfalls and alternative strategies addressed?',
      ],
    },
    {
      id: 'feasibility', name: 'Feasibility', short: 'Feasibility', group: 'core', bulleted: true, unscored: true, maxChars: 2000,
      keywords: ['timeline', 'feasibility', 'milestones', 'recruitment', 'preliminary', 'resources'],
      description: 'Can the project be completed within the timeline and with the available resources?',
      prompts: [
        'Is the timeline realistic for a one- or two-year award?',
        'Is access to samples and data assured, with documentation where postmortem tissue is used?',
        'Human Experience: is participant recruitment credible, including through HD Trialfinder and the COE network?',
        'Do preliminary data or prior experience support feasibility?',
        'Are IRB or equivalent approvals planned so funds can be disbursed on time?',
      ],
    },
    {
      id: 'investigator', name: 'Strength of Candidate and Mentor lab', short: 'Candidate & mentor', group: 'core', bulleted: true, unscored: true, maxChars: 2000,
      keywords: ['investigator', 'applicant', 'candidate', 'mentor', 'team', 'expertise', 'environment', 'institution', 'biosketch', 'training'],
      description: 'Do the applicant and mentor have the relationship, skills, and resources to successfully carry out the project? Is it a supportive environment for working on HD?',
      prompts: [
        'Does the applicant have the training and track record the aims require?',
        'Is the mentor qualified, with a primary academic or research appointment, and is the mentoring relationship established and specific to this project?',
        'Does the mentor lab bring the expertise, samples, cohorts, or technologies the project depends on?',
        'Is the environment supportive of HD research, with the facilities and clinical connections the project needs?',
        'Is the applicant committing at least 50% effort?',
        'Would the award bring a new investigator into HD research or strengthen an early career in it?',
      ],
    },
    {
      id: 'collaboration', name: 'Clinical Collaboration', short: 'Collaboration', group: 'core', bulleted: true, unscored: true, maxChars: 2000,
      keywords: ['collaboration', 'center of excellence', 'clinical site', 'clinic', 'letter', 'partner', 'patient engagement', 'lived experience'],
      description: 'HDSA requires a meaningful collaboration with an HDSA Center of Excellence or HD clinical site, which goes beyond data access or a letter of support. It should involve active engagement from the clinical partner in the design, conduct, or interpretation of the research.',
      prompts: [
        'Is there a named HDSA Center of Excellence or HD clinical site, and is the collaboration described concretely?',
        'Does the clinical partner take an active part in design, conduct, or interpretation, rather than only supplying samples, data, or a letter?',
        'Are sample procurement and data access supported by the partner and feasible?',
        'Human Experience: are people with lived experience engaged in meaningful ways?',
      ],
    },
    {
      id: 'fit', name: 'Program Fit', short: 'Program fit', group: 'additional',
      keywords: ['human biology', 'human experience', 'stream', 'program'],
      scale: {
        kind: 'categorical',
        options: [
          { value: 'fits', label: 'Fits the chosen stream' },
          { value: 'other-stream', label: 'Belongs in the other stream', hint: 'Molecular or biomarker work without functional relevance belongs in Human Biology; participant-centered work belongs in Human Experience.' },
          { value: 'outside', label: 'Outside both streams' },
        ],
      },
      description: 'Human Biology projects must involve clinical samples or patient-derived data (iPSC work must be tied to patient findings). Human Experience projects must involve active human participants whose experience is central to the question.',
      prompts: ['Is the project in the right stream, and does it meet that stream\'s core requirement?'],
    },
    {
      id: 'budget', name: 'Budget', short: 'Budget', group: 'additional',
      keywords: ['budget', 'justification', 'salary', 'effort'],
      scale: {
        kind: 'categorical',
        options: [
          { value: 'appropriate', label: 'Appropriate and within limits' },
          { value: 'adjust', label: 'Adjustments recommended' },
          { value: 'noncompliant', label: 'Exceeds RFP limits' },
        ],
      },
      description: 'Up to $90,000 per year for one or two years: at most $72,000 for salary and fringe, at most $30,000 for research costs, travel capped at $5,000 per year, no equipment or personal computing devices, no indirect costs, minimum 50% applicant effort.',
      prompts: ['Do the salary, research-cost, and travel lines respect the RFP caps?', 'Are the costs justified by the plan?'],
    },
  ],
  overall: {
    label: 'Overall score',
    description: 'One score for the whole application: 1 is exceptional, 9 is poor. Historically, applications scoring 1 to 4 have been considered fundable by HDSA\'s SAB.',
    scale: HDSA_SCALE,
  },
  recommendations: ['Yes, discuss at the SAB meeting', 'No, discussion not needed'],
  checklist: [
    ...CORE_CHECKS,
    { id: 'coe', label: 'Substantive collaboration with an HDSA Center of Excellence or HD clinical site', category: 'feasibility', patterns: [/Center(s)? of Excellence/i, /\bCOE\b/, /HD clinic/i, /clinical (site|partner|collaborat)/i] },
    { id: 'samples', label: 'Human Biology: clinical samples or patient-derived data are central', category: 'science', patterns: [/patient-?derived/i, /clinical samples?/i, /biofluid|\bCSF\b|\bPBMCs?\b|postmortem|post-mortem/i, /biorepositor/i] },
    { id: 'participants', label: 'Human Experience: active human participants and a recruitment plan', category: 'feasibility', patterns: [/participants?\b/i, /recruit(ment|ing)?/i, /Trialfinder/i] },
    { id: 'lived', label: 'People with lived experience engaged in design or conduct', category: 'science', patterns: [/lived experience/i, /patient (partners?|engagement|advisory)/i, /caregivers?/i] },
    { id: 'biomarkers', label: 'Biomarkers or endpoints tied to treatment response or HD-ISS stage (if applicable)', category: 'science', patterns: [/biomarker/i, /HD-?ISS/i, /endpoints?/i, /responders?/i] },
    { id: 'effort', label: 'Applicant effort of at least 50%', category: 'compliance', patterns: [/\b(50|[5-9]\d|100)\s?% ?(effort|FTE)/i, /percent effort/i] },
    { id: 'mentor', label: 'Mentor letter for mentored or trainee applications', category: 'compliance', patterns: [/letter of support/i, /mentor/i] },
    { id: 'dataSharingHdsa', label: 'Data sharing and PubMed Central deposit acknowledged', category: 'compliance', patterns: [/PubMed Central|\bPMC\b/i, ...RX.dataSharing] },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Weigh the criteria in this order: impact, scientific approach, feasibility, strength of candidate and mentor lab, clinical collaboration.',
    'Both streams require a meaningful collaboration with an HDSA Center of Excellence or equivalent; data access or a letter of support alone is not sufficient.',
    'Human Biology favours patient-derived samples, proof-of-response studies, and biomarkers that distinguish responders from non-responders; iPSC work must be framed by findings from patient samples.',
    'Human Experience favours cognitive, psychiatric, behavioural, rehabilitation, caregiver, and patient-reported outcomes work with active participants.',
    'Early-career investigators and HD newcomers are especially encouraged; judge mentored applications with that in mind.',
    'Pilot-scale experimental medicine studies with limited power are acceptable when they establish feasibility and generate hypotheses.',
    'Budget caps: $90,000 per year, $72,000 salary and fringe, $30,000 research costs, $5,000 travel, no equipment, no indirects.',
    'ProposalCentral: every comment box takes at most 2,000 characters including spaces (15,000 for applicant feedback), and you must click outside a box to save it.',
  ],
  expectedSections: ['Abstract', 'Specific Aims', 'Background', 'Significance', 'Research Plan', 'Approach', 'Methods', 'Feasibility', 'Timeline', 'Budget', 'Budget Justification', 'Key Personnel', 'Biographical Sketch', 'Letters of Support', 'Human Subjects', 'Clinical Collaboration'],
};

/* ---------- HDF (Hereditary Disease Foundation) ---------- */

const HDF: Framework = {
  id: 'hdf',
  name: 'HDF Research Grant / Postdoctoral Fellowship',
  agency: 'HDF',
  blurb:
    'The Hereditary Disease Foundation\'s Scientific Advisory Board scores nine criteria: relevance, novelty, significance, scientific premise, approach, applicant, environment, budget, and NIH formatting. The scale is not published; the 1 to 5 default here can be changed to match your score sheet.',
  criterionScale: FIVE_POINT,
  criteria: [
    {
      id: 'relevance', name: 'Relevance', short: 'Relevance', group: 'core', bulleted: true,
      keywords: ['relevance', 'huntington', 'disease mechanism', 'therapeutic', 'background'],
      description: 'Is the proposed project relevant to understanding fundamental disease mechanisms in Huntington\'s disease or advancing disease-modifying therapeutics?',
      prompts: ['Does the project bear directly on HD mechanisms or on disease-modifying therapy?', 'If the work is in another brain disease or a model system, is the path to HD explicit?'],
    },
    {
      id: 'novelty', name: 'Novelty', short: 'Novelty', group: 'core', bulleted: true,
      keywords: ['novel', 'innovation', 'innovative', 'original'],
      description: 'Are the hypotheses, approaches, and expected findings novel?',
      prompts: ['What is new in the hypothesis, the approach, or the expected findings?', 'Is the innovation a genuine departure or a refinement of existing work?'],
    },
    {
      id: 'significance', name: 'Significance', short: 'Significance', group: 'core', bulleted: true,
      keywords: ['significance', 'impact', 'advance'],
      description: 'If the proposed study is completed, will it make a conceptual advance in understanding HD pathogenic mechanisms?',
      prompts: ['What conceptual advance would completion deliver?', 'How would the field or therapy development change as a result?'],
    },
    {
      id: 'premise', name: 'Scientific Premise', short: 'Premise', group: 'core', bulleted: true,
      keywords: ['premise', 'preliminary', 'rationale', 'evidence', 'literature'],
      description: 'Is the proposed study based on strong evidence derived from the literature or preliminary data?',
      prompts: ['Is the rationale supported by rigorous prior work or convincing preliminary data?', 'Are the key assumptions tested or testable?'],
    },
    {
      id: 'approach', name: 'Approach', short: 'Approach', group: 'core', bulleted: true,
      keywords: ['approach', 'methods', 'design', 'analysis', 'aims', 'research plan', 'timeline'],
      description: 'Is the proposed scientific plan appropriate and feasible for addressing the main question(s)?',
      prompts: ['Are the design, methods, and analyses appropriate to the questions?', 'Is the plan feasible within one year (grant) or two years (fellowship)?', 'Are pitfalls and alternatives considered?', 'Is rigor addressed: sample size, blinding, replication, sex as a variable?'],
    },
    {
      id: 'applicant', name: 'Applicant', short: 'Applicant', group: 'core', bulleted: true,
      keywords: ['applicant', 'biosketch', 'track record', 'mentor', 'investigator', 'independence'],
      description: 'Is the applicant qualified to conduct and/or supervise the proposed study? Does the applicant have a track record in the research field relevant to the proposal?',
      prompts: ['Do training, publications, and preliminary work show the applicant can deliver?', 'Fellowships: is the mentor\'s letter strong and the training plan credible?', 'Grants from junior applicants: do the letters address independence and expertise?', 'Is the applicant committed to a career in HD research?'],
    },
    {
      id: 'environment', name: 'Environment', short: 'Environment', group: 'core', bulleted: true,
      keywords: ['environment', 'institution', 'facilities', 'resources', 'support'],
      description: 'Does the applicant\'s institution provide sufficient support to ensure the proposed studies can be completed in an optimal and timely manner?',
      prompts: ['Are the facilities, core services, and institutional support adequate?', 'Are collaborations in place for any specialised needs?'],
    },
    {
      id: 'budget', name: 'Budget', short: 'Budget', group: 'additional',
      keywords: ['budget', 'justification', 'overlap', 'other support'],
      scale: {
        kind: 'categorical',
        options: [
          { value: 'appropriate', label: 'Appropriate, no overlap' },
          { value: 'adjust', label: 'Adjustments recommended' },
          { value: 'overlap', label: 'Overlap with other funding' },
        ],
      },
      description: 'Is the budget appropriate for the proposed plan? Is there budget overlap with the applicant\'s other ongoing grants? Up to $100,000 per year; no indirect costs.',
      prompts: ['Are salary, supplies, equipment, and benefits justified by the plan?', 'Is there overlap with other ongoing grants?'],
    },
    {
      id: 'format', name: 'NIH Guidelines', short: 'Formatting', group: 'additional',
      keywords: ['format', 'guidelines'],
      scale: ACCEPTABLE_SCALE,
      description: 'Grants must follow NIH formatting guidelines, including NIH-style biosketches.',
      prompts: ['Does the application follow NIH formatting and include NIH-style biosketches for investigators?'],
    },
  ],
  overall: {
    label: 'Overall score',
    description: 'Your overall assessment for the Scientific Advisory Board. HDF gives highest priority to the most innovative and impactful proposals and to early-career investigators committed to HD research.',
    scale: FIVE_POINT,
  },
  recommendations: ['Recommend funding', 'Fundable if resources allow', 'Do not recommend'],
  checklist: [
    ...CORE_CHECKS,
    { id: 'hdRelevance', label: 'Direct relevance to Huntington\'s disease is explicit', category: 'science', patterns: [/Huntington/i, /\bHTT\b|huntingtin/i, /\bCAG\b/] },
    { id: 'mentor', label: 'Mentor letter (fellowships) or letters on independence (junior grants)', category: 'compliance', patterns: [/letter of support/i, /mentor/i, /independen(ce|t)/i] },
    { id: 'overlap', label: 'No budget overlap with other ongoing grants', category: 'compliance', patterns: [/overlap/i, /other support/i, /current(ly)? funded|active grants?/i] },
    { id: 'career', label: 'Career stage and commitment to HD research are clear', category: 'feasibility', patterns: [/postdoctoral|post-doctoral|early[- ]career|years? (since|post) (PhD|Ph\.D)/i, /career/i] },
    ...REVIEWER_CHECKS,
  ],
  guidance: [
    'Only the most meritorious applications are funded; HDF gives highest priority to the most innovative and impactful proposals.',
    'Early-career investigators, including postdoctoral fellows committed to HD research, are prioritised; fellowships are for postdocs up to 7 years post-PhD.',
    'Research grants are one year (renewable once) and are meant to generate preliminary data; judge scope accordingly.',
    'Check for budget overlap with other ongoing grants; HDF does not pay indirect costs.',
    'The application must have direct relevance to Huntington\'s disease.',
  ],
  expectedSections: ['Abstract', 'Specific Aims', 'Background', 'Significance', 'Innovation', 'Approach', 'Research Strategy', 'Preliminary Data', 'Budget', 'Budget Justification', 'Biographical Sketch', 'Letters of Support', 'Other Support'],
};

/* ---------- registry ---------- */

/** Checklist attached to reviewer-defined frameworks. */
export const DEFAULT_CHECKLIST: ChecklistItemDef[] = [...CORE_CHECKS, { id: 'kt', label: 'Dissemination plan is described', category: 'science', patterns: RX.kt }, ...REVIEWER_CHECKS];

/** Serialisable definition of a reviewer-defined framework (no RegExp). */
export interface CustomFrameworkDef {
  id: string;
  name: string;
  agency: string;
  blurb: string;
  criteria: {
    id: string;
    name: string;
    short: string;
    description: string;
    prompts: string[];
    group: CriterionGroup;
    scale?: ScaleDef;
    unscored?: boolean;
    maxChars?: number;
  }[];
  criterionScale: ScaleDef;
  overall: { label: string; description: string; scale: ScaleDef };
  recommendations?: string[];
  guidance?: string[];
  form?: FormSpec;
  createdAt: number;
  updatedAt: number;
}

const STOP_KEYWORDS = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'a', 'an', 'or', 'with', 'on']);

/** Build a runtime Framework from a stored definition. */
export function customToFramework(def: CustomFrameworkDef): Framework {
  return {
    id: def.id,
    name: def.name,
    agency: def.agency || 'Custom',
    blurb: def.blurb || 'Reviewer-defined framework.',
    criterionScale: def.criterionScale,
    criteria: def.criteria.map((c) => ({
      ...c,
      bulleted: true,
      keywords: c.name
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length > 3 && !STOP_KEYWORDS.has(w)),
    })),
    overall: def.overall,
    recommendations: def.recommendations?.length ? def.recommendations : undefined,
    checklist: DEFAULT_CHECKLIST,
    guidance: def.guidance ?? [],
    expectedSections: [],
    form: def.form,
    custom: true,
  };
}

/** Turn any framework into an editable definition (used to duplicate built-ins). */
export function frameworkToCustomDef(fw: Framework, id: string, name?: string): CustomFrameworkDef {
  const now = Date.now();
  return {
    id,
    name: name ?? `${fw.name} (copy)`,
    agency: fw.agency,
    blurb: fw.blurb,
    criteria: fw.criteria.map((c) => ({ id: c.id, name: c.name, short: c.short, description: c.description, prompts: [...c.prompts], group: c.group, scale: c.scale, unscored: c.unscored, maxChars: c.maxChars })),
    criterionScale: fw.criterionScale,
    overall: { ...fw.overall },
    recommendations: fw.recommendations ? [...fw.recommendations] : undefined,
    guidance: [...fw.guidance],
    form: fw.form ? JSON.parse(JSON.stringify(fw.form)) : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

let customFrameworks: Framework[] = [];

/** Replace the set of reviewer-defined frameworks available to getFramework(). */
export function setCustomFrameworks(defs: CustomFrameworkDef[]): void {
  customFrameworks = defs.map(customToFramework);
}

export function allFrameworks(): Framework[] {
  return [...FRAMEWORKS, ...customFrameworks];
}

export const FRAMEWORKS: Framework[] = [NIH_2025, NIH_LEGACY, NSF, CIHR, ERC, HORIZON, NSERC, NHMRC, WELLCOME, UKRI, DFG, HDSA, HDF, GENERIC];

export function getFramework(id: string): Framework {
  return FRAMEWORKS.find((f) => f.id === id) ?? customFrameworks.find((f) => f.id === id) ?? GENERIC;
}

export function criterionScale(fw: Framework, c: Criterion): ScaleDef {
  return c.scale ?? fw.criterionScale;
}

const DEFAULT_FIELDS: Record<'summary' | 'additional' | 'overallComment', FieldSpec & { label: string }> = {
  summary: { label: 'Summary of the application' },
  additional: { label: 'Additional comments' },
  overallComment: { label: 'Overall rationale' },
};

/** Label, hint, and limit for one of the free-text boxes, with the framework's overrides applied. */
export function fieldSpec(fw: Framework, key: 'summary' | 'additional' | 'overallComment'): FieldSpec & { label: string } {
  return { ...DEFAULT_FIELDS[key], ...(fw.form?.[key] ?? {}) };
}

/** Label for the recommendation choice ("Recommendation" unless the funder calls it something else). */
export function recommendationSpec(fw: Framework): { label: string; hint?: string; required?: boolean } {
  return fw.form?.recommendation ?? { label: 'Recommendation' };
}

/** Human-readable label for a score value on a scale. */
export function scoreLabel(scale: ScaleDef, value: number | string | undefined): string {
  if (value === undefined || value === '') return '';
  if (scale.kind === 'categorical') {
    return scale.options.find((o) => o.value === value)?.label ?? String(value);
  }
  const n = Number(value);
  if (!scale.labels) return String(n);
  if (scale.labels[n]) return `${n} ${scale.labels[n]}`;
  // banded labels (CIHR): pick the highest threshold <= n
  const thresholds = Object.keys(scale.labels).map(Number).sort((a, b) => b - a);
  const t = thresholds.find((th) => n >= th);
  return t !== undefined ? `${n.toFixed(scale.step && scale.step < 1 ? 1 : 0)} ${scale.labels[t]}` : String(n);
}

/** Suggest a framework id from text found in the application. */
export function detectFramework(text: string): string | undefined {
  const t = text.slice(0, 20000);
  // Named funders first: foundations often require NIH-style formatting, so
  // "Specific Aims" or a biosketch must not be mistaken for an NIH application.
  if (/Huntington'?s Disease Society of America|\bHDSA\b|Human Biology Project|Human Experience Project/i.test(t)) return 'hdsa';
  if (/Hereditary Disease Foundation|\bHDF\b/i.test(t)) return 'hdf';
  if (/Canadian Institutes of Health Research|\bCIHR\b|Foundation Grant|Nominated Principal Applicant/i.test(t)) return 'cihr-project';
  if (/European Research Council|\bERC\b|Starting Grant|Consolidator Grant|Synergy Grant/i.test(t)) return 'erc';
  if (/Horizon Europe|\bHORIZON-[A-Z]+/i.test(t)) return 'horizon-europe';
  if (/\bNSERC\b|Natural Sciences and Engineering Research Council|Discovery Grant/i.test(t)) return 'nserc-discovery';
  if (/\bNHMRC\b|National Health and Medical Research Council|Ideas Grant/i.test(t)) return 'nhmrc-ideas';
  if (/\bWellcome\b/i.test(t)) return 'wellcome';
  if (/Deutsche Forschungsgemeinschaft|\bDFG\b|Sachbeihilfe/i.test(t)) return 'dfg';
  if (/National Science Foundation/i.test(t)) return 'nsf';
  if (/\bUKRI\b|Medical Research Council|\bBBSRC\b|\bEPSRC\b/i.test(t)) return 'ukri';
  // NIH: mechanism codes and the agency name are decisive.
  if (/National Institutes of Health|\bR01\b|\bR21\b|\bR03\b|\bR35\b|\bU01\b|\bU54\b|\bK99\b|\bK08\b|\bP01\b|\bP50\b|\bF31\b|\bF32\b/i.test(t)) return 'nih-2025';
  // Weaker signals last.
  if (/Intellectual Merit|Broader Impacts|\bNSF\b/i.test(t)) return 'nsf';
  if (/\bMRC\b|Case for Support/i.test(t)) return 'ukri';
  if (/\bNIH\b|Specific Aims/i.test(t)) return 'nih-2025';
  return undefined;
}

/* ---------- per-reviewer menu preferences ---------- */

/** Which frameworks a reviewer pins, hides, and uses by default. Synced as an account record. */
export interface FrameworkPrefs {
  pinned: string[];
  hidden: string[];
  /** Preselected for new reviews instead of detecting from the PDF. */
  defaultId?: string;
}

export const EMPTY_PREFS: FrameworkPrefs = { pinned: [], hidden: [] };

/**
 * Order frameworks for a menu: pinned first in pin order, then the rest, hidden ones left
 * out. `keepId` is always included so a review's current framework never vanishes from
 * the menu that shows it.
 */
export function arrangeFrameworks(all: Framework[], prefs: FrameworkPrefs, keepId?: string): { pinned: Framework[]; others: Framework[]; hiddenCount: number } {
  const byId = new Map(all.map((f) => [f.id, f] as const));
  const visible = (f: Framework) => !prefs.hidden.includes(f.id) || f.id === keepId;
  const pinned = prefs.pinned.map((id) => byId.get(id)).filter((f): f is Framework => !!f && visible(f));
  const pinnedIds = new Set(pinned.map((f) => f.id));
  const others = all.filter((f) => !pinnedIds.has(f.id) && visible(f));
  return { pinned, others, hiddenCount: all.length - pinned.length - others.length };
}

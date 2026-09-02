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

export const FRAMEWORKS: Framework[] = [NIH_2025, NIH_LEGACY, NSF, CIHR, ERC, GENERIC];

export function getFramework(id: string): Framework {
  return FRAMEWORKS.find((f) => f.id === id) ?? GENERIC;
}

export function criterionScale(fw: Framework, c: Criterion): ScaleDef {
  return c.scale ?? fw.criterionScale;
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
  // NIH signals are checked first: its mechanism codes are unambiguous, and the
  // phrase "Project Grant" can appear inside an NIH mechanism description.
  if (/National Institutes of Health|\bNIH\b|\bR01\b|\bR21\b|\bR03\b|\bR35\b|\bU01\b|\bU54\b|\bK99\b|\bK08\b|\bP01\b|\bP50\b|\bF31\b|\bF32\b|Specific Aims/i.test(t)) return 'nih-2025';
  if (/Canadian Institutes of Health Research|\bCIHR\b|Foundation Grant|Nominated Principal Applicant/i.test(t)) return 'cihr-project';
  if (/European Research Council|\bERC\b|Starting Grant|Consolidator Grant|Synergy Grant/i.test(t)) return 'erc';
  if (/National Science Foundation|\bNSF\b|Intellectual Merit|Broader Impacts/i.test(t)) return 'nsf';
  return undefined;
}

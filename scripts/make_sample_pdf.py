#!/usr/bin/env python3
"""Generate a realistic (fictional) NIH R01 application PDF for demoing Panelist.

The content is invented. It is written to exercise the app's heuristics:
section headings, specific aims, preliminary data, rigor language, a budget,
timeline, human-subjects and data-sharing sections, and references.
"""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, ListFlowable, ListItem,
)
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sample-application.pdf")

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=13,
                    spaceBefore=14, spaceAfter=6, textColor=HexColor("#1a2a3a"))
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11,
                    spaceBefore=10, spaceAfter=4, textColor=HexColor("#243447"))
BODY = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Times-Roman", fontSize=10.5,
                      leading=14, alignment=TA_JUSTIFY, spaceAfter=6)
AIM = ParagraphStyle("Aim", parent=BODY, fontName="Times-Bold", spaceBefore=4)
TITLE = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=16,
                       leading=20, alignment=TA_CENTER, textColor=HexColor("#12202f"))
SUB = ParagraphStyle("Sub", parent=BODY, alignment=TA_CENTER, fontName="Helvetica", fontSize=10.5,
                     textColor=HexColor("#40536a"))
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=9, leading=12)
REF = ParagraphStyle("Ref", parent=BODY, fontSize=9, leading=12, spaceAfter=3)

story = []


def p(text, style=BODY):
    story.append(Paragraph(text, style))


def gap(h=6):
    story.append(Spacer(1, h))


# ---------- title page ----------
gap(40)
p("Astrocyte-Derived Exosomal miR-133b as a Driver of Synaptic Repair After Ischemic Stroke", TITLE)
gap(10)
p("Principal Investigator: Dr. Elena M. Vasquez, PhD", SUB)
p("Institution: Cascade University School of Medicine", SUB)
p("Funding Mechanism: NIH R01 (Research Project Grant)", SUB)
p("Requested Budget: $1,984,500 direct costs over 5 years", SUB)
gap(24)
p("<b>Abstract.</b> Ischemic stroke is the second leading cause of death worldwide and a "
  "principal cause of long-term disability, yet no approved therapy promotes neural repair "
  "once the acute window has closed. Astrocytes shape recovery through paracrine signalling, "
  "but the molecular cargo that mediates beneficial astrocyte-neuron communication remains "
  "poorly defined. We have found that reactive astrocytes secrete exosomes enriched for "
  "microRNA-133b (<i>miR-133b</i>) and that these exosomes restore dendritic spine density in "
  "peri-infarct cortex. This proposal tests the hypothesis that astrocyte-derived exosomal "
  "<i>miR-133b</i> drives synaptic repair by de-repressing the RhoA/ROCK pathway in neighbouring "
  "neurons. We will define the mechanism, establish causal necessity and sufficiency in vivo, "
  "and evaluate an engineered exosome as a delivery vehicle. The work should establish a new, "
  "tractable target for post-stroke recovery.", BODY)

story.append(PageBreak())

# ---------- specific aims ----------
p("Specific Aims", H1)
p("Stroke affects more than 12 million people each year. During the sub-acute phase, "
  "spontaneous but incomplete circuit remodelling occurs in the tissue surrounding the infarct. "
  "Reactive astrocytes are central to this process, but whether their secreted vesicles carry "
  "instructions for repair, and what those instructions are, is not known. "
  "The exact mechanisms underlying astrocyte-neuron exosomal signalling in the injured brain "
  "remain poorly understood.")
p("<b>Preliminary data.</b> To investigate astrocyte cargo, we purified exosomes from reactive "
  "astrocytes and profiled their small-RNA content by sequencing. We found that <i>miR-133b</i> "
  "was the most enriched species (18-fold over quiescent astrocytes), and that applying these "
  "exosomes to cortical neurons increased spine density by 42% (n = 6 biological replicates, "
  "p = 0.003). These findings motivate the central hypothesis below.")
p("<b><i>Central hypothesis: astrocyte-derived exosomal miR-133b promotes synaptic repair after "
  "ischemic stroke by silencing RhoA and relieving ROCK-mediated inhibition of spine "
  "formation.</i></b>", BODY)
p("We propose three specific aims:")
p("Aim 1: To determine the molecular mechanism by which exosomal miR-133b regulates the "
  "RhoA/ROCK pathway in peri-infarct neurons. We will combine argonaute pull-down, luciferase "
  "reporter assays, and phospho-cofilin readouts. We expect miR-133b to bind the RhoA 3' UTR "
  "directly.", AIM)
p("Aim 2: To establish the necessity and sufficiency of astrocytic miR-133b for recovery in a "
  "photothrombotic stroke model. Using astrocyte-specific conditional knockout and rescue, and "
  "with the experimenter blinded to genotype, we will test motor recovery and spine dynamics by "
  "two-photon imaging. Sample size was set by power analysis (see Approach).", AIM)
p("Aim 3: To evaluate engineered miR-133b exosomes as a therapeutic delivered after the acute "
  "window. We will functionalise exosomes with a targeting peptide and assess dose, timing, and "
  "safety. Potential pitfalls and alternative delivery strategies are described.", AIM)
p("<b>Impact.</b> Completion of these aims will establish exosomal miR-133b as a mechanism and a "
  "candidate target for post-stroke neural repair, a stage of care with no approved options.")

story.append(PageBreak())

# ---------- research strategy ----------
p("Research Strategy", H1)

p("Significance", H2)
p("Stroke recovery is a major unmet need. Rehabilitation offers modest gains and no pharmacological "
  "agent is approved to enhance repair after the first hours. This project addresses that barrier by "
  "targeting the endogenous machinery of astrocyte-neuron communication. The scientific premise rests "
  "on a well-supported literature linking the RhoA/ROCK axis to spine dynamics, together with our own "
  "preliminary evidence that astrocytic exosomes carry miR-133b. If successful, the work would shift "
  "the field from a descriptive account of astrocyte reactivity toward a manipulable molecular target.")

p("Innovation", H2)
p("The proposal is innovative in three respects. First, it identifies a specific exosomal microRNA as "
  "an instructive signal rather than a bystander. Second, it applies astrocyte-specific conditional "
  "genetics to exosomal cargo in vivo, which has not been done for miR-133b. Third, it develops an "
  "engineered, peptide-targeted exosome as a delivery vehicle, moving beyond viral approaches.")

p("Approach", H2)
p("<b>Overview.</b> The three aims progress from mechanism to causal test to translation, and are "
  "designed to be semi-independent so that a negative result in one does not invalidate the others.")

p("<b>Aim 1 design.</b> We will map miR-133b targets using argonaute HITS-CLIP in primary neurons, "
  "validate direct binding with luciferase reporters bearing wild-type and seed-mutant RhoA 3' UTRs, "
  "and quantify downstream ROCK activity through phospho-cofilin immunoblotting. All experiments "
  "include vehicle and scrambled-oligo controls and are repeated in at least three independent "
  "biological replicates. Antibodies will be validated by knockdown.")

p("<b>Aim 2 design and rigor.</b> Photothrombotic stroke will be induced in adult mice of both sexes. "
  "Sex is included as a biological variable and the analysis is powered to detect a sex interaction. "
  "Animals will be randomised to condition and the experimenter blinded to genotype during behaviour "
  "and imaging. A power analysis based on our preliminary effect size (Cohen's d = 1.4) indicates "
  "that n = 14 per group provides 80% power at alpha = 0.05; we will enrol n = 16 to allow for "
  "attrition. Data will be analysed with mixed-effects models that treat animal as a random effect, "
  "avoiding pseudoreplication across repeated spine measurements. Primary and secondary outcomes are "
  "pre-specified.")

p("<b>Aim 3 design.</b> Exosomes will be functionalised with the RVG targeting peptide. We will test "
  "three doses and two delivery times (day 3 and day 7 post-stroke). Safety will be assessed by body "
  "weight, neuroinflammation markers, and off-target biodistribution.")

p("<b>Potential pitfalls and alternative approaches.</b> If miR-133b does not bind RhoA directly, we "
  "will pursue indirect regulation through the predicted target Nrf2, for which we have secondary "
  "evidence. If engineered exosomes show poor brain penetration, we will evaluate focused-ultrasound "
  "blood-brain-barrier opening as an alternative. These contingencies limit the risk that any single "
  "failure blocks progress.")

p("<b>Timeline.</b> Aim 1 will occupy years 1 to 2, Aim 2 years 2 to 4, and Aim 3 years 4 to 5, with "
  "milestones at the end of each year. A Gantt chart is provided in the appendix.")

p("<b>Statistical analysis.</b> All analyses use two-sided tests with a false discovery rate "
  "correction for multiple comparisons. Effect sizes and 95% confidence intervals will be reported "
  "alongside p-values. Analyses were designed with a biostatistician co-investigator.")

story.append(PageBreak())

# ---------- other sections ----------
p("Investigators and Environment", H1)
p("Dr. Vasquez is an Associate Professor with a sustained record in glial biology and 24 peer-reviewed "
  "publications on astrocyte signalling. The team includes Dr. Okafor (exosome engineering), Dr. Lindqvist "
  "(biostatistics), and Dr. Reyes (two-photon imaging). The Cascade University Neuroscience Institute "
  "provides shared core facilities for sequencing, imaging, and rodent behaviour. Letters of support from "
  "the imaging and biostatistics cores are attached. The environment and resources are well suited to the "
  "proposed work.")

p("Vertebrate Animals", H1)
p("All procedures were approved by the Cascade University IACUC (protocol 2025-0417). We justify the use "
  "of mice by the need for an intact neurovascular unit and astrocyte-specific genetics. Numbers were "
  "minimised through power analysis. Isoflurane anaesthesia and approved euthanasia methods will be used, "
  "and the 3Rs are addressed in the vertebrate animals section.")

p("Human Subjects", H1)
p("This project does not involve human subjects. Post-mortem human tissue used for validation is "
  "de-identified and provided by the university brain bank under an approved protocol; it is not "
  "considered human subjects research.")

p("Data Management and Sharing Plan", H1)
p("Sequencing data will be deposited in the Gene Expression Omnibus (GEO) upon publication. Analysis code "
  "will be released on GitHub under an open license and archived on Zenodo with a DOI. Processed data and "
  "protocols will be shared through protocols.io. The plan is consistent with the NIH data sharing policy.")

p("Authentication of Key Resources", H1)
p("Cell lines will be authenticated by STR profiling and tested for mycoplasma. Antibodies will be "
  "validated by genetic knockdown, and key plasmids will be verified by full-insert sequencing.")

# ---------- budget ----------
p("Budget Justification", H1)
p("The requested budget of $1,984,500 in direct costs over five years supports the following:")
budget = [
    ["Category", "Year 1", "Total (5 yr)"],
    ["Personnel (PI, 2 postdocs, technician)", "$248,000", "$1,310,000"],
    ["Animals and per diem", "$34,000", "$180,000"],
    ["Sequencing and reagents", "$52,000", "$268,500"],
    ["Imaging core recharge", "$28,000", "$146,000"],
    ["Travel and publication", "$8,000", "$40,000"],
    ["Other (exosome production)", "$8,000", "$40,000"],
]
t = Table(budget, colWidths=[3.2 * inch, 1.4 * inch, 1.4 * inch])
t.setStyle(TableStyle([
    ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9.5),
    ("FONT", (0, 1), (-1, -1), "Times-Roman", 9.5),
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#e6ecf2")),
    ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#b8c2ce")),
    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#ffffff"), HexColor("#f4f7fa")]),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(t)
gap(6)
p("Personnel costs reflect institutional salary scales and effort. Animal costs follow per-diem rates. "
  "Sequencing costs are based on core facility quotes. The budget is justified by the scope of the aims.")

# ---------- landscape budget detail (mixed page sizes exercise the viewer) ----------
from reportlab.platypus import NextPageTemplate, PageTemplate, Frame
from reportlab.lib.pagesizes import landscape
story.append(NextPageTemplate("landscape"))
story.append(PageBreak())
p("Detailed Budget by Year", H1)
years = ["Category", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Total"]
rows = [years,
        ["Personnel", "$248,000", "$255,440", "$263,103", "$270,996", "$279,126", "$1,316,665"],
        ["Animals", "$34,000", "$35,020", "$36,071", "$37,153", "$38,267", "$180,511"],
        ["Reagents and sequencing", "$52,000", "$53,560", "$55,167", "$56,822", "$58,526", "$276,075"],
        ["Imaging core", "$28,000", "$28,840", "$29,705", "$30,596", "$31,514", "$148,655"],
        ["Travel and publication", "$8,000", "$8,000", "$8,000", "$8,000", "$8,000", "$40,000"],
        ["Total direct costs", "$370,000", "$380,860", "$392,046", "$403,567", "$415,433", "$1,961,906"]]
t2 = Table(rows, colWidths=[2.4 * inch] + [1.05 * inch] * 6)
t2.setStyle(TableStyle([
    ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9.5),
    ("FONT", (0, 1), (-1, -1), "Times-Roman", 9.5),
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#e6ecf2")),
    ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#b8c2ce")),
    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 9.5),
]))
story.append(t2)
gap(8)
p("Timeline (Gantt)", H2)
gantt = [["Activity", "Y1", "Y2", "Y3", "Y4", "Y5"],
         ["Aim 1: mechanism", "■■■■", "■■■■", "", "", ""],
         ["Aim 2: in vivo necessity and sufficiency", "", "■■", "■■■■", "■■■■", ""],
         ["Aim 3: engineered exosome therapeutic", "", "", "", "■■■■", "■■■■"],
         ["Data sharing and dissemination", "■", "■", "■", "■", "■■■"]]
t3 = Table(gantt, colWidths=[3.4 * inch] + [1.0 * inch] * 5)
t3.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9.5), ("FONT", (0, 1), (-1, -1), "Times-Roman", 9.5),
                        ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#b8c2ce")), ("ALIGN", (1, 1), (-1, -1), "CENTER"),
                        ("TEXTCOLOR", (1, 1), (-1, -1), HexColor("#2c6b70"))]))
story.append(t3)
story.append(NextPageTemplate("portrait"))
story.append(PageBreak())

# ---------- references ----------
p("References Cited", H1)
refs = [
    "Xin H, et al. (2013) Exosome-mediated transfer of miR-133b from stromal cells promotes neurite "
    "outgrowth. Stem Cells 31(12):2737-2746.",
    "Liu Y, et al. (2019) Astrocyte-derived exosomes in central nervous system injury. J Neurosci "
    "39(4):601-615.",
    "Mulherkar S, Tolias KF (2020) RhoA-ROCK signalling in the synapse. Cells 9(1):245.",
    "Zhang Z, et al. (2021) Reactive astrocytes and stroke recovery. Nat Rev Neurosci 22:210-227.",
    "Alvarez-Erviti L, et al. (2011) Delivery of siRNA to the mouse brain by systemic injection of "
    "targeted exosomes. Nat Biotechnol 29:341-345.",
    "Clarke LE, et al. (2018) Normal aging induces A1-like astrocyte reactivity. PNAS 115:E1896-E1905.",
    "Carmichael ST (2016) Emergent properties of neural repair. Ann Neurol 79:895-906.",
    "Nichols E, et al. (2020) Global burden of stroke. Lancet Neurol 19(3):255-265.",
]
for i, r in enumerate(refs, 1):
    p(f"{i}. {r}", REF)

from reportlab.platypus import BaseDocTemplate
doc = BaseDocTemplate(os.path.abspath(OUT), pagesize=letter,
                      topMargin=0.9 * inch, bottomMargin=0.9 * inch,
                      leftMargin=1.0 * inch, rightMargin=1.0 * inch,
                      title="Sample R01 Application (fictional)",
                      author="Panelist demo")
W, H = letter
LW, LH = landscape(letter)
doc.addPageTemplates([
    PageTemplate(id="portrait", frames=[Frame(1.0 * inch, 0.9 * inch, W - 2.0 * inch, H - 1.8 * inch, id="pf")], pagesize=letter),
    PageTemplate(id="landscape", frames=[Frame(0.8 * inch, 0.8 * inch, LW - 1.6 * inch, LH - 1.6 * inch, id="lf")], pagesize=landscape(letter)),
])
doc.build(story)
print("wrote", os.path.abspath(OUT))

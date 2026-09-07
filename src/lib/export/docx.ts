import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { Draft, DraftBullet, ExportOptions } from '../draft';

function para(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; spacingAfter?: number } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size })],
    spacing: { after: opts.spacingAfter ?? 120 },
  });
}

function bullets(title: string, list: DraftBullet[]): Paragraph[] {
  if (!list.length) return [];
  return [
    new Paragraph({ children: [new TextRun({ text: title, bold: true })], spacing: { before: 120, after: 60 } }),
    ...list.map((b) => new Paragraph({ children: [new TextRun(b.text)], bullet: { level: 0 }, spacing: { after: 60 } })),
  ];
}

function multiline(text: string): Paragraph[] {
  return text
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => para(t));
}

/** The framework's description and guiding questions, set apart in italics. */
function guide(description: string, prompts: string[] = []): Paragraph[] {
  const out: Paragraph[] = [];
  if (description) out.push(para(description, { italics: true, size: 20, spacingAfter: 60 }));
  for (const p of prompts) out.push(new Paragraph({ children: [new TextRun({ text: p, italics: true, size: 20 })], bullet: { level: 0 }, spacing: { after: 40 } }));
  if (out.length) out.push(para('', { spacingAfter: 60 }));
  return out;
}

export async function draftToDocx(d: Draft, opts: ExportOptions = {}): Promise<Blob> {
  const children: Paragraph[] = [];
  children.push(new Paragraph({ text: `Review: ${d.title}`, heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }));
  children.push(para(`${d.frameworkName}. Drafted ${new Date(d.generatedAt).toLocaleDateString()}.`, { italics: true, spacingAfter: 240 }));
  if (opts.includeGuidance && d.guide.about) children.push(...guide(`How ${d.guide.agency} reviews: ${d.guide.about}`));
  children.push(new Paragraph({ text: d.labels.summary, heading: HeadingLevel.HEADING_1 }));
  children.push(...multiline(d.summary));

  for (const s of d.sections) {
    if (s.empty && !(opts.includeGuidance && s.guide)) continue;
    children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
    if (opts.includeGuidance && s.guide) children.push(...guide(s.guide.description, s.guide.prompts));
    if (s.scoreLine) children.push(para(s.scoreLine, { bold: true }));
    if (s.body) children.push(...multiline(s.body));
    children.push(...bullets('Strengths', s.strengths));
    children.push(...bullets('Weaknesses', s.weaknesses));
    children.push(...bullets('Questions for the applicants', s.questions));
    children.push(...bullets('Other comments', s.notes));
  }

  if (d.additional.length) {
    children.push(new Paragraph({ text: 'Additional review criteria', heading: HeadingLevel.HEADING_1 }));
    for (const a of d.additional) {
      children.push(new Paragraph({ children: [new TextRun({ text: `${a.heading}. `, bold: true }), new TextRun(a.line)], bullet: { level: 0 }, spacing: { after: 60 } }));
    }
  }

  children.push(new Paragraph({ text: d.overall.heading, heading: HeadingLevel.HEADING_1 }));
  if (opts.includeGuidance) children.push(...guide([d.guide.overall, d.guide.scaleHint].filter(Boolean).join(' ')));
  if (d.overall.scoreLine) children.push(para(d.overall.scoreLine, { bold: true }));
  if (d.overall.recommendation) children.push(para(`${d.overall.recommendationLabel} ${d.overall.recommendation}`, { bold: true }));
  if (d.overall.body) children.push(...multiline(d.overall.body));

  if (d.additionalComments) {
    children.push(new Paragraph({ text: d.labels.additional, heading: HeadingLevel.HEADING_1 }));
    children.push(...multiline(d.additionalComments));
  }
  if (opts.includeConfidential && d.confidential) {
    children.push(new Paragraph({ text: 'Confidential comments to the program', heading: HeadingLevel.HEADING_1 }));
    children.push(...multiline(d.confidential));
  }
  if (opts.includeGuidance && d.guide.guidance.length) {
    children.push(new Paragraph({ text: `${d.guide.agency} guidance to reviewers`, heading: HeadingLevel.HEADING_1 }));
    for (const g of d.guide.guidance) children.push(new Paragraph({ children: [new TextRun({ text: g, italics: true })], bullet: { level: 0 }, spacing: { after: 60 } }));
  }

  const doc = new Document({
    creator: 'Panelist',
    title: `Review: ${d.title}`,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: '1F3D3F' }, paragraph: { spacing: { before: 280, after: 120 } } },
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 40, bold: true }, paragraph: { spacing: { after: 120 } } },
      ],
    },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

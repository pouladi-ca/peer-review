import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { Draft, DraftBullet } from '../draft';

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

export async function draftToDocx(d: Draft, opts: { includeConfidential?: boolean } = {}): Promise<Blob> {
  const children: Paragraph[] = [];
  children.push(new Paragraph({ text: `Review: ${d.title}`, heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }));
  children.push(para(`${d.frameworkName}. Drafted ${new Date(d.generatedAt).toLocaleDateString()}.`, { italics: true, spacingAfter: 240 }));
  children.push(new Paragraph({ text: 'Summary of the application', heading: HeadingLevel.HEADING_1 }));
  children.push(...multiline(d.summary));

  for (const s of d.sections) {
    if (s.empty) continue;
    children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
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
  if (d.overall.scoreLine) children.push(para(d.overall.scoreLine, { bold: true }));
  if (d.overall.recommendation) children.push(para(`Recommendation: ${d.overall.recommendation}`, { bold: true }));
  if (d.overall.body) children.push(...multiline(d.overall.body));

  if (d.additionalComments) {
    children.push(new Paragraph({ text: 'Additional comments', heading: HeadingLevel.HEADING_1 }));
    children.push(...multiline(d.additionalComments));
  }
  if (opts.includeConfidential && d.confidential) {
    children.push(new Paragraph({ text: 'Confidential comments to the program', heading: HeadingLevel.HEADING_1 }));
    children.push(...multiline(d.confidential));
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

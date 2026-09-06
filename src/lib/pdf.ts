import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageText, TextLine, TextRun } from './types';
import { buildLigatureRepair, type LigatureRepair } from './analyze/ligatures';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

export async function loadPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return pdfjs.getDocument({
    data: bytes,
    // Non-embedded base-14 fonts and CJK encodings need these bundled assets.
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
  }).promise;
}

interface RawItem {
  str: string;
  x: number; // viewport px at scale 1 (top-left origin)
  y: number; // top
  w: number;
  h: number;
  size: number;
  baseline: number;
}

function isTextItem(i: unknown): i is TextItem {
  return typeof (i as TextItem).str === 'string' && Array.isArray((i as TextItem).transform);
}

/** Extract positioned text for one page. */
export async function extractPage(page: PDFPageProxy): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const raw: RawItem[] = [];
  for (const item of content.items) {
    if (!isTextItem(item)) continue;
    if (!item.str || !item.str.trim()) continue;
    const [a, b, , , e, f] = item.transform as number[];
    const size = item.height || Math.hypot(a, b) || 10;
    const h = size * 1.05;
    // Box spans from a little below the baseline to the ascent above it.
    // pdf.js v6 exposes convertToViewportPoint only, so convert two corners.
    const vp = viewport as unknown as { convertToViewportPoint(x: number, y: number): [number, number] };
    const [x1, y1] = vp.convertToViewportPoint(e, f - size * 0.25);
    const [x2, y2] = vp.convertToViewportPoint(e + item.width, f + size * 0.8);
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    raw.push({ str: item.str, x: left, y: top, w: Math.abs(x2 - x1), h: Math.max(Math.abs(y2 - y1), h), size, baseline: f });
  }

  // Sort into reading order: top to bottom, then left to right.
  raw.sort((p, q) => (Math.abs(p.y - q.y) > Math.max(p.size, q.size) * 0.5 ? p.y - q.y : p.x - q.x));

  const lines: RawItem[][] = [];
  for (const it of raw) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur[0].y - it.y) <= Math.max(cur[0].size, it.size) * 0.5) cur.push(it);
    else lines.push([it]);
  }

  const runs: TextRun[] = [];
  const textLines: TextLine[] = [];
  const parts: string[] = [];
  const W = viewport.width;
  const H = viewport.height;
  for (const line of lines) {
    line.sort((p, q) => p.x - q.x);
    // Merge items that touch, so that every run is separated by exactly one character.
    const merged: RawItem[] = [];
    for (const it of line) {
      const last = merged[merged.length - 1];
      if (last && it.x - (last.x + last.w) < last.size * 0.15 && !/\s$/.test(last.str) && !/^\s/.test(it.str)) {
        last.str += it.str;
        last.w = Math.max(last.w, it.x + it.w - last.x);
        last.h = Math.max(last.h, it.h);
      } else {
        merged.push({ ...it, str: it.str.replace(/\s+$/g, '') || it.str });
      }
    }
    const lineIndex = textLines.length;
    const lineRuns: TextRun[] = merged.map((m) => ({ str: m.str.trim(), x: m.x / W, y: m.y / H, w: m.w / W, h: m.h / H, size: m.size, line: lineIndex }));
    const text = lineRuns.map((r) => r.str).join(' ');
    runs.push(...lineRuns);
    parts.push(text);
    textLines.push({ text, size: Math.max(...merged.map((m) => m.size)), y: Math.min(...merged.map((m) => m.y)) / H, x: merged[0].x / W, page: page.pageNumber });
  }

  return { page: page.pageNumber, width: viewport.width, height: viewport.height, text: parts.join('\n'), lines: textLines, runs };
}

/** Page sizes at scale 1, cheap enough to run before text extraction so the viewer can lay pages out at once. */
export async function pageDims(pdf: PDFDocumentProxy): Promise<{ w: number; h: number }[]> {
  const out: { w: number; h: number }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const v = page.getViewport({ scale: 1 });
    out.push({ w: v.width, h: v.height });
  }
  return out;
}

export async function extractAllPages(pdf: PDFDocumentProxy, onProgress?: (done: number, total: number) => void): Promise<PageText[]> {
  const out: PageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    out.push(await extractPage(page));
    onProgress?.(i, pdf.numPages);
  }
  return out;
}

/**
 * Repair ligature glyphs that pdf.js emitted as U+0000 (see analyze/ligatures).
 * Mutates the pages so runs, lines, and text stay aligned, and returns the
 * repair so the caller can apply it to text copied from the text layer.
 */
export function repairLigatures(pages: PageText[]): LigatureRepair {
  const repair = buildLigatureRepair(pages.map((p) => p.text));
  if (repair.count === 0) return repair;
  for (const page of pages) {
    if (!page.text.includes('\u0000')) continue;
    for (const run of page.runs) run.str = repair.fix(run.str);
    const byLine = new Map<number, string[]>();
    for (const run of page.runs) byLine.set(run.line, [...(byLine.get(run.line) ?? []), run.str]);
    page.lines.forEach((line, i) => {
      line.text = (byLine.get(i) ?? []).join(' ');
    });
    page.text = page.lines.map((l) => l.text).join('\n');
  }
  return repair;
}

export async function sha256(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

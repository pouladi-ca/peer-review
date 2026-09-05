/** The reflowed document model produced by the server (server/panelist/extract.py). */

export type BlockType = 'heading' | 'paragraph' | 'list-item' | 'figure' | 'page-image';
export type FigureKind = 'figure' | 'table' | 'page';

/** A styled slice of a block's text. `block.text === runs.map(r => r.t).join('')`. */
export interface Run {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  sup?: boolean;
  sub?: boolean;
  /** id of the figure this run references */
  fig?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  level?: number;
  page: number;
  text: string;
  runs?: Run[];
  figure?: string;
}

export interface Figure {
  id: string;
  kind: FigureKind;
  label: string;
  caption: string;
  page: number;
  /** relative to the reflow directory, e.g. "figures/f002.png" */
  src: string;
  w: number;
  h: number;
  blockId?: string;
}

export interface TocEntry {
  blockId: string;
  title: string;
  level: number;
  page: number;
}

export interface ReflowDoc {
  version: number;
  title: string;
  pages: number[];
  bodyFontSize?: number;
  blocks: Block[];
  figures: Figure[];
  toc: TocEntry[];
}

/** A note's position in the reflowed text. */
export interface ReadAnchor {
  startBlock: string;
  startOff: number;
  endBlock: string;
  endOff: number;
}

export type ReflowStatus = { status: 'none' } | { status: 'processing'; done: number; total: number; message: string } | { status: 'ready' } | { status: 'error'; error: string };

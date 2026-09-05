/**
 * DOM ↔ document-model offset arithmetic.
 *
 * The reader renders each block's runs as a straight concatenation, so the character
 * offsets of the DOM text nodes inside a `[data-block]` element are exactly the offsets
 * of `block.text`. These helpers walk the text nodes to convert a browser selection into
 * a `{start_block, start_off, end_block, end_off}` anchor.
 *
 * Not every rendered block has model text. Figure and page-image cards are `text: ''` in
 * doc.json yet carry a visible caption in the DOM, so a boundary landing inside one would
 * produce an anchor whose quote and painted range disagree. Those blocks are marked
 * `data-nontext` by the renderer and every boundary is snapped off them — outwards, in
 * the direction that keeps the most text — before an anchor is built.
 */
import type { ReadAnchor } from './types';

const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT — spelled out so this works headless.
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const DOCUMENT_POSITION_PRECEDING = 2;

/** The `[data-block]` element containing `node`, or null when outside `root`. */
export function blockElementFor(node: Node | null, root: Element): HTMLElement | null {
  if (!node) return null;
  const el =
    node.nodeType === ELEMENT_NODE ? (node as Element) : (node.parentElement as Element | null);
  if (!el) return null;
  const block = el.closest('[data-block]') as HTMLElement | null;
  if (!block || !root.contains(block)) return null;
  return block;
}

/** Total length of the text nodes inside `blockEl` that come strictly before `node`. */
function precedingTextLength(blockEl: Element, node: Node): number {
  if (node === blockEl) return 0;
  const doc = blockEl.ownerDocument;
  if (!doc) return 0;
  const walker = doc.createTreeWalker(blockEl, SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) break;
    const relation = node.compareDocumentPosition(current);
    // Text nodes inside `node` report CONTAINED_BY, later ones FOLLOWING: both end the walk.
    if (!(relation & DOCUMENT_POSITION_PRECEDING)) break;
    total += current.textContent ? current.textContent.length : 0;
    current = walker.nextNode();
  }
  return total;
}

/**
 * Character offset of a DOM boundary point within a block's text.
 * Returns -1 when the node is not inside the block.
 */
export function textOffsetWithin(blockEl: Element, node: Node, offset: number): number {
  if (node !== blockEl && !blockEl.contains(node)) return -1;
  const base = precedingTextLength(blockEl, node);
  if (node.nodeType === TEXT_NODE) {
    const len = node.textContent ? node.textContent.length : 0;
    return base + Math.max(0, Math.min(offset, len));
  }
  // An element boundary point sits before child #offset.
  let extra = 0;
  const kids = node.childNodes;
  for (let i = 0; i < offset && i < kids.length; i++) {
    const t = kids[i].textContent;
    extra += t ? t.length : 0;
  }
  return base + extra;
}

interface Boundary {
  block: HTMLElement;
  offset: number;
}

function allBlocks(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-block]'));
}

/** False for figure and page-image cards, whose model text is empty. */
export function isTextBlock(block: Element): boolean {
  return !block.hasAttribute('data-nontext');
}

function endOf(block: HTMLElement): number {
  return block.textContent ? block.textContent.length : 0;
}

/**
 * Move a boundary that landed on a block with no model text to the nearest block that
 * has some: a start moves forward to the beginning of the next text block, an end moves
 * back to the end of the previous one. Returns null when there is none in that
 * direction, which drops the boundary — and with it the whole selection.
 */
function snapOffNonText(block: HTMLElement, root: Element, side: 'start' | 'end'): Boundary | null {
  const blocks = allBlocks(root);
  const at = blocks.indexOf(block);
  if (at < 0) return null;
  const step = side === 'start' ? 1 : -1;
  for (let i = at + step; i >= 0 && i < blocks.length; i += step) {
    const candidate = blocks[i];
    if (!isTextBlock(candidate)) continue;
    return { block: candidate, offset: side === 'start' ? 0 : endOf(candidate) };
  }
  return null;
}

/** Land on a block, snapping off it first when it carries no model text. */
function boundaryOn(block: HTMLElement, root: Element, side: 'start' | 'end'): Boundary | null {
  if (!isTextBlock(block)) return snapOffNonText(block, root, side);
  return { block, offset: side === 'start' ? 0 : endOf(block) };
}

/**
 * Resolve one end of a range to a block and a character offset.
 *
 * A boundary does not always land inside a block: dragging past the end of a list puts it
 * on the `<ul>` wrapper, and select-all puts it on the content root itself. In those
 * cases the boundary is snapped outwards — the start moves forward to the beginning of
 * the next block, the end moves back to the end of the previous one — so the selection
 * still yields a usable anchor instead of being silently dropped.
 */
function resolveBoundary(
  node: Node,
  offset: number,
  root: Element,
  side: 'start' | 'end',
): Boundary | null {
  const direct = blockElementFor(node, root);
  if (direct) {
    if (!isTextBlock(direct)) return snapOffNonText(direct, root, side);
    const resolved = textOffsetWithin(direct, node, offset);
    return resolved < 0 ? null : { block: direct, offset: resolved };
  }
  if (node.nodeType !== ELEMENT_NODE || !(node === root || root.contains(node))) return null;

  // Descend to the child the boundary points at, then take the first/last block in it.
  const kids = (node as Element).childNodes;
  const child = side === 'start' ? kids[offset] : kids[offset - 1];
  if (child && child.nodeType === ELEMENT_NODE) {
    const el = child as Element;
    const within = el.matches('[data-block]') ? [el as HTMLElement] : allBlocks(el);
    const inside = side === 'start' ? within[0] : within[within.length - 1];
    if (inside && root.contains(inside)) return boundaryOn(inside, root, side);
  }

  // Nothing usable below the boundary: fall back to the document edges.
  const blocks = allBlocks(root);
  if (blocks.length === 0) return null;
  return boundaryOn(side === 'start' ? blocks[0] : blocks[blocks.length - 1], root, side);
}

/**
 * Convert a Range into an anchor. Returns null when the range is collapsed, empty, or
 * neither end can be resolved to a block inside the reader content.
 */
export function anchorFromRange(range: Range, root: Element): ReadAnchor | null {
  if (range.collapsed) return null;
  const start = resolveBoundary(range.startContainer, range.startOffset, root, 'start');
  const end = resolveBoundary(range.endContainer, range.endOffset, root, 'end');
  if (!start || !end) return null;
  const startId = start.block.getAttribute('data-block');
  const endId = end.block.getAttribute('data-block');
  if (!startId || !endId) return null;
  if (startId === endId && end.offset <= start.offset) return null;
  // Snapping off a figure can push the start past the end — a caption-only selection
  // leaves nothing behind, and there is no anchor to make.
  if (
    startId !== endId &&
    start.block.compareDocumentPosition(end.block) & DOCUMENT_POSITION_PRECEDING
  ) {
    return null;
  }
  return { startBlock: startId, startOff: start.offset, endBlock: endId, endOff: end.offset };
}

/** Convenience wrapper over the current window selection. */
export function anchorFromSelection(selection: Selection | null, root: Element): ReadAnchor | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return anchorFromRange(selection.getRangeAt(0), root);
}

/**
 * Renders the reflowed document. Ported from Marginalia.
 *
 * Invariant: the text inside a `[data-block]` element is the straight concatenation of
 * that block's runs, which is what lets `lib/reflow/offsets.ts` map a DOM selection back
 * to `block.text` offsets by summing text-node lengths. Figure cards render a caption
 * that is not part of the block's text, so they are marked `data-nontext`.
 */
import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { ZoomIn } from 'lucide-react';
import { api } from '../../lib/api';
import { splitRuns, type HighlightSpan } from '../../lib/reflow/segments';
import type { Block, Figure, ReflowDoc, Run } from '../../lib/reflow/types';

interface Props {
  reviewId: string;
  docId: string;
  doc: ReflowDoc;
  spans: Map<string, HighlightSpan[]>;
  selectedNoteId: string | null;
  onOpenFigure: (figureId: string) => void;
}

function styleRun(run: Run, node: ReactNode): ReactNode {
  let out = node;
  if (run.sup) out = <sup>{out}</sup>;
  else if (run.sub) out = <sub>{out}</sub>;
  if (run.u) out = <u>{out}</u>;
  if (run.i) out = <em>{out}</em>;
  if (run.b) out = <strong>{out}</strong>;
  return out;
}

function inlineFor(block: Block, spans: HighlightSpan[], selectedNoteId: string | null, onOpenFigure: (id: string) => void): ReactNode[] {
  const runs: Run[] = block.runs && block.runs.length > 0 ? block.runs : block.text ? [{ t: block.text }] : [];
  const segments = splitRuns(runs, spans);
  const lastOf = new Map<string, number>();
  segments.forEach((seg, i) => {
    if (seg.mark) lastOf.set(seg.mark.id, i);
  });
  return segments.map((segment, index) => {
    let node: ReactNode = styleRun(segment.run, segment.text);
    if (segment.run.fig) {
      const fig = segment.run.fig;
      node = (
        <button type="button" className="figref" onClick={() => onOpenFigure(fig)}>
          {node}
        </button>
      );
    }
    if (segment.mark) {
      const m = segment.mark;
      node = (
        <mark data-ann={m.id} className={`rhl rhl-${m.kind} ${m.id === selectedNoteId ? 'is-selected' : ''} ${m.hasComment && lastOf.get(m.id) === index ? 'has-comment' : ''}`}>
          {node}
        </mark>
      );
    }
    return <Fragment key={index}>{node}</Fragment>;
  });
}

function FigureCard({ reviewId, docId, block, figure, onOpenFigure }: { reviewId: string; docId: string; block: Block; figure: Figure | undefined; onOpenFigure: (id: string) => void }) {
  if (!figure) return null;
  return (
    <figure className="figcard" data-block={block.id} data-page={block.page} data-nontext="">
      <button type="button" className="figcard-open" onClick={() => onOpenFigure(figure.id)} aria-label={`Open ${figure.label || 'figure'}`}>
        <img src={api.figureUrl(reviewId, docId, figure.src)} alt={figure.caption || figure.label || 'Figure'} width={figure.w || undefined} height={figure.h || undefined} loading="lazy" decoding="async" />
        <span className="figcard-zoom" aria-hidden>
          <ZoomIn size={15} />
        </span>
      </button>
      {(figure.label || figure.caption) && (
        <figcaption className="figcard-caption">
          {figure.label && <span className="figcard-label">{figure.label}</span>}
          {figure.caption}
        </figcaption>
      )}
    </figure>
  );
}

export const Content = memo(function Content({ reviewId, docId, doc, spans, selectedNoteId, onOpenFigure }: Props) {
  const figuresById = useMemo(() => new Map(doc.figures.map((f) => [f.id, f] as const)), [doc.figures]);

  const renderOne = (block: Block): ReactNode => {
    const common = { 'data-block': block.id, 'data-page': block.page } as const;
    if (block.type === 'figure' || block.type === 'page-image') {
      return <FigureCard key={block.id} reviewId={reviewId} docId={docId} block={block} figure={block.figure ? figuresById.get(block.figure) : undefined} onOpenFigure={onOpenFigure} />;
    }
    const inline = inlineFor(block, spans.get(block.id) ?? [], selectedNoteId, onOpenFigure);
    if (block.type === 'heading') {
      const level = block.level ?? 1;
      if (level <= 1)
        return (
          <h2 key={block.id} {...common}>
            {inline}
          </h2>
        );
      if (level === 2)
        return (
          <h3 key={block.id} {...common}>
            {inline}
          </h3>
        );
      return (
        <h4 key={block.id} {...common}>
          {inline}
        </h4>
      );
    }
    if (block.type === 'list-item')
      return (
        <li key={block.id} {...common}>
          {inline}
        </li>
      );
    return (
      <p key={block.id} {...common}>
        {inline}
      </p>
    );
  };

  const out: ReactNode[] = [];
  let i = 0;
  while (i < doc.blocks.length) {
    const block = doc.blocks[i];
    if (block.type === 'list-item') {
      const items: ReactNode[] = [];
      const first = block.id;
      while (i < doc.blocks.length && doc.blocks[i].type === 'list-item') {
        items.push(renderOne(doc.blocks[i]));
        i += 1;
      }
      out.push(<ul key={`ul-${first}`}>{items}</ul>);
      continue;
    }
    out.push(renderOne(block));
    i += 1;
  }
  return <>{out}</>;
});

import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import type { Figure } from '../../lib/reflow/types';
import { isTyping } from '../../hooks/useGlobal';

const DOUBLE_TAP_MS = 320;
const SWIPE_CLOSE_PX = 80;

/** Full-screen figure viewer: pinch and wheel zoom, double-tap zoom, swipe down to close. */
export function FigureViewer({ reviewId, docId, figures, index, onIndex, onClose, onShowInText }: { reviewId: string; docId: string; figures: Figure[]; index: number; onIndex: (i: number) => void; onClose: () => void; onShowInText: (f: Figure) => void }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pz = useRef<PanzoomObject | null>(null);
  const lastTap = useRef(0);
  const swipeStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const figure = figures[index];

  useEffect(() => {
    const el = imgRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return;
    const instance = Panzoom(el, { maxScale: 8, minScale: 1, contain: 'inside', cursor: 'grab', step: 0.35, animate: true, duration: 180 });
    pz.current = instance;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      instance.zoomWithWheel(e);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', onWheel);
      instance.destroy();
      pz.current = null;
    };
  }, [index]);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= figures.length) return;
      pz.current?.reset({ animate: false });
      onIndex(next);
    },
    [figures.length, index, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === '[' || e.key === 'ArrowLeft') go(-1);
      if (e.key === ']' || e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onClose]);

  if (!figure) return null;

  return (
    <div className="figviewer" role="dialog" aria-modal="true" aria-label={figure.label || 'Figure'} style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}>
      <div className="figviewer-top">
        <span className="figviewer-label">
          {figure.label || (figure.kind === 'table' ? 'Table' : 'Figure')}
          {figures.length > 1 && <span className="muted"> · {index + 1} of {figures.length}</span>}
        </span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div
        ref={stageRef}
        className="figviewer-stage"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onPointerUp={(e) => {
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            const inst = pz.current;
            if (inst) {
              if (inst.getScale() > 1.2) inst.reset();
              else inst.zoomToPoint(2.5, { clientX: e.clientX, clientY: e.clientY });
            }
            lastTap.current = 0;
          } else lastTap.current = now;
        }}
      >
        <img ref={imgRef} src={api.figureUrl(reviewId, docId, figure.src)} alt={figure.caption || figure.label || 'Figure'} draggable={false} />
      </div>
      {index > 0 && (
        <button type="button" className="figviewer-nav prev" onClick={() => go(-1)} aria-label="Previous figure">
          <ChevronLeft size={22} />
        </button>
      )}
      {index < figures.length - 1 && (
        <button type="button" className="figviewer-nav next" onClick={() => go(1)} aria-label="Next figure">
          <ChevronRight size={22} />
        </button>
      )}
      <div
        className="figviewer-caption"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          swipeStart.current = e.clientY;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (swipeStart.current === null) return;
          const dy = e.clientY - swipeStart.current;
          setDragY(dy > 0 ? dy : 0);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture?.(e.pointerId);
          const close = dragY > SWIPE_CLOSE_PX;
          swipeStart.current = null;
          setDragY(0);
          if (close) onClose();
        }}
        onPointerCancel={() => {
          swipeStart.current = null;
          setDragY(0);
        }}
      >
        <span className="figviewer-text">
          {figure.label && <span className="figcard-label">{figure.label}</span>}
          {figure.caption}
        </span>
        <span className="figviewer-actions">
          <button type="button" className="btn btn-s" onClick={() => onShowInText(figure)}>
            Show in text
          </button>
          <span className="muted small">p. {figure.page}</span>
        </span>
      </div>
    </div>
  );
}

/** Mounted once at the app level; renders when a figure is open. */
export function FigureViewerHost() {
  const open = useStore((s) => s.figureViewer);
  const review = useStore((s) => s.review);
  const reflow = useStore((s) => (open ? s.reflow[open.docId] : undefined));
  if (!open || !review || !reflow?.doc) return null;
  const figures = reflow.doc.figures;
  const index = Math.max(0, figures.findIndex((f) => f.id === open.figureId));
  return (
    <FigureViewer
      reviewId={review.id}
      docId={open.docId}
      figures={figures}
      index={index}
      onIndex={(i) => useStore.getState().openFigure(open.docId, figures[i].id)}
      onClose={() => useStore.getState().openFigure(open.docId, null)}
      onShowInText={(f) => {
        const s = useStore.getState();
        s.openFigure(open.docId, null);
        s.setViewMode('read');
        s.jumpTo({ docId: open.docId, page: f.page, blockId: f.blockId });
      }}
    />
  );
}

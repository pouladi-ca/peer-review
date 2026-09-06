/**
 * The reading view: the server's reflowed document rendered as clean, responsive text
 * with figure cards, highlights for every note, and the same tagging flow as the page
 * view. Position (current page) is shared with the page view, so switching views or
 * devices resumes at the same place.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, Loader2, Minus, Plus } from 'lucide-react';
import { useStore, selectActiveDoc, selectActiveMeta } from '../../lib/store';
import { criterionForHint, sectionAt } from '../../lib/analyze/outline';
import { useFramework } from '../../hooks/useFramework';
import { isTyping } from '../../hooks/useGlobal';
import { isTouchLike } from '../../hooks/useMedia';
import { spansByBlock, quoteFor, indexBlocks, type ResolvedNote } from '../../lib/reflow/anchors';
import { anchorFromSelection } from '../../lib/reflow/offsets';
import { anchorForQuote, rectsForQuote } from '../../lib/reflow/locate';
import type { NoteKind } from '../../lib/types';
import type { ReadAnchor } from '../../lib/reflow/types';
import { Content } from './Content';
import { SelectionToolbar, type PendingSelection } from '../viewer/SelectionToolbar';
import { ViewModeToggle } from '../viewer/ViewModeToggle';
import { IconButton, KIND_META } from '../ui';

const STICKY = 8;
/** Jumps place the target block this far below the top edge, so "current page" is read there too. */
const JUMP_OFFSET = 72;

function readScale(): number {
  try {
    const v = Number(localStorage.getItem('panelist.readScale'));
    return v >= 0.8 && v <= 1.6 ? v : 1;
  } catch {
    return 1;
  }
}

export function ReadView() {
  const review = useStore((s) => s.review)!;
  const runtime = useStore(selectActiveDoc);
  const meta = useStore(selectActiveMeta);
  const activeDocId = useStore((s) => s.activeDocId)!;
  const reflow = useStore((s) => s.reflow[activeDocId]);
  const page = useStore((s) => s.page);
  const jump = useStore((s) => s.jump);
  const selectedNoteId = useStore((s) => s.selectedNoteId);
  const fw = useFramework(review.frameworkId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  interface ReadPending {
    page: number;
    rects: PendingSelection['rects'];
    quote: string;
    anchor: ReadAnchor;
    point: PendingSelection['anchor'];
    criterionName?: string;
  }
  const [pending, setPending] = useState<ReadPending | null>(null);
  const [scale, setScale] = useState(readScale);
  const doc = reflow?.doc;

  useEffect(() => {
    void useStore.getState().ensureReflow(activeDocId);
  }, [activeDocId]);

  /* ---------- notes → highlight spans ---------- */
  const resolved = useMemo<ResolvedNote[]>(() => {
    if (!doc) return [];
    const out: ResolvedNote[] = [];
    for (const a of review.annotations) {
      if (a.docId !== activeDocId) continue;
      const anchor = a.anchor ?? anchorForQuote(doc, a.page, a.quote);
      if (!anchor) continue;
      out.push({ id: a.id, kind: a.kind, hasComment: !!a.comment.trim(), createdAt: a.createdAt, anchor });
    }
    return out;
  }, [doc, review.annotations, activeDocId]);
  const spans = useMemo(() => (doc ? spansByBlock(resolved, doc.blocks) : new Map()), [doc, resolved]);
  const blockIndex = useMemo(() => (doc ? indexBlocks(doc.blocks) : new Map<string, number>()), [doc]);

  /* ---------- position: the topmost visible block's page ---------- */
  const raf = useRef(0);
  const trackPosition = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      const root = contentRef.current;
      if (!el || !root) return;
      // Probe just below where jumps land a block, so a jump to page N reports page N and
      // not the tail of the previous block still visible above it.
      const top = el.getBoundingClientRect().top + JUMP_OFFSET + STICKY;
      const blocks = root.querySelectorAll<HTMLElement>('[data-block]');
      let current: HTMLElement | null = null;
      for (const b of blocks) {
        const r = b.getBoundingClientRect();
        if (r.bottom > top) {
          current = b;
          break;
        }
      }
      if (!current) current = blocks[blocks.length - 1] ?? null;
      const p = Number(current?.dataset.page);
      if (p) useStore.getState().setPage(p);
    });
  }, []);

  // A deliberate scroll dismisses a pending selection; programmatic scrolls do not.
  const dismissPending = useCallback(() => {
    setPending((cur) => (cur ? null : cur));
  }, []);

  const scrollToBlock = useCallback((blockId: string | undefined, flash = false) => {
    const el = scrollRef.current;
    const root = contentRef.current;
    if (!el || !root || !blockId) return;
    const target = root.querySelector<HTMLElement>(`[data-block="${CSS.escape(blockId)}"]`);
    if (!target) return;
    const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - JUMP_OFFSET;
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (flash) {
      target.classList.add('is-flash');
      setTimeout(() => target.classList.remove('is-flash'), 1800);
    }
  }, []);

  const firstBlockOnPage = useCallback(
    (p: number): string | undefined => {
      if (!doc) return undefined;
      const exact = doc.blocks.find((b) => b.page === p && b.text);
      return (exact ?? doc.blocks.find((b) => b.page >= p))?.id;
    },
    [doc],
  );

  // Restore the shared reading position when the document becomes ready.
  const restored = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!doc || restored.current === activeDocId) return;
    restored.current = activeDocId;
    const last = review.lastPage[activeDocId] ?? 1;
    if (last > 1) {
      requestAnimationFrame(() => scrollToBlock(firstBlockOnPage(last)));
      useStore.getState().announceResume(activeDocId, last, nearestHeading(doc, last) || undefined);
    }
  }, [doc, activeDocId, review.lastPage, scrollToBlock, firstBlockOnPage]);

  // Jumps from the outline, notes, checklist, and figure viewer.
  const lastJump = useRef<number | null>(null);
  useEffect(() => {
    if (!jump || !doc || jump.docId !== activeDocId || lastJump.current === jump.token) return;
    lastJump.current = jump.token;
    let blockId = jump.blockId;
    if (!blockId && jump.flashNoteId) blockId = resolved.find((n) => n.id === jump.flashNoteId)?.anchor.startBlock;
    if (!blockId) blockId = firstBlockOnPage(jump.page);
    scrollToBlock(blockId, !!jump.flashNoteId);
  }, [jump, doc, activeDocId, resolved, scrollToBlock, firstBlockOnPage]);

  /* ---------- selection → note ---------- */
  const readSelection = useCallback(() => {
    const root = contentRef.current;
    const sel = window.getSelection();
    if (!root || !doc || !sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    const anchor = anchorFromSelection(sel, root);
    if (!anchor) {
      setPending(null);
      return;
    }
    const quote = quoteFor(doc.blocks, anchor);
    if (!quote) {
      setPending(null);
      return;
    }
    const startBlock = doc.blocks[blockIndex.get(anchor.startBlock) ?? 0];
    const pageNo = startBlock?.page ?? page;
    const rects = runtime?.status === 'ready' ? rectsForQuote(runtime.pages[pageNo - 1] ?? runtime.pages[0], quote) : [];
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const below = r.top < 90;
    const section = runtime?.status === 'ready' ? sectionAt(runtime.outline, pageNo, 0) : undefined;
    const crit = review.focusCriterionId ?? criterionForHint(fw, section?.criterionHint);
    setPending({ page: pageNo, rects, quote, anchor, criterionName: fw.criteria.find((c) => c.id === crit)?.short, point: { x: r.left + r.width / 2, y: below ? r.bottom : r.top, below } });
  }, [doc, blockIndex, runtime, review.focusCriterionId, fw, activeDocId, page]);

  const tag = useCallback(
    (kind: NoteKind) => {
      if (!pending) return;
      const section = runtime?.status === 'ready' ? sectionAt(runtime.outline, pending.page, 0) : undefined;
      const criterionId = review.focusCriterionId ?? criterionForHint(fw, section?.criterionHint);
      useStore.getState().addAnnotation({ docId: activeDocId, page: pending.page, rects: pending.rects, quote: pending.quote, kind, criterionId, severity: kind === 'weakness' ? 'minor' : undefined, anchor: pending.anchor });
      window.getSelection()?.removeAllRanges();
      setPending(null);
      useStore.getState().notify(`${KIND_META[kind].label} added on page ${pending.page}`, 'success');
    },
    [pending, runtime, review.focusCriterionId, fw, activeDocId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pending || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const kind = (Object.keys(KIND_META) as NoteKind[]).find((x) => KIND_META[x].key.toLowerCase() === k);
      if (kind) {
        e.preventDefault();
        tag(kind);
      } else if (e.key === 'Escape') {
        setPending(null);
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, tag]);

  useEffect(() => {
    if (!isTouchLike()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(readSelection, 350);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      if (timer) clearTimeout(timer);
    };
  }, [readSelection]);

  const onClickContent = useCallback((e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-ann]');
    if (!mark) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const s = useStore.getState();
    s.selectNote(mark.dataset.ann!);
    s.setTab('notes');
    if (window.innerWidth < 720) s.setSheet('panel');
  }, []);

  const changeScale = (delta: number) => {
    const next = Math.min(1.6, Math.max(0.8, Math.round((scale + delta) * 100) / 100));
    setScale(next);
    try {
      localStorage.setItem('panelist.readScale', String(next));
    } catch {
      /* ignore */
    }
  };

  const total = meta?.pages ?? 0;
  const goto = (p: number) => {
    const clamped = Math.max(1, Math.min(total || p, p));
    useStore.getState().jumpTo({ docId: activeDocId, page: clamped });
  };


  return (
    <section className="viewer read">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-group">
          <IconButton icon={ChevronLeft} label="Previous page ([)" onClick={() => goto(page - 1)} disabled={page <= 1} />
          <span className="page-ctrl">
            <input type="number" min={1} max={total || 1} value={page} onChange={(e) => goto(Number(e.target.value))} onFocus={(e) => e.target.select()} aria-label="Page number" />
            <span>/ {total || '–'}</span>
          </span>
          <IconButton icon={ChevronRight} label="Next page (])" onClick={() => goto(page + 1)} disabled={page >= total} />
        </div>
        <div className="viewer-section">{doc?.toc.length ? nearestHeading(doc, page) : (meta?.name ?? '')}</div>
        <div className="viewer-toolbar-group">
          <IconButton icon={Minus} label="Smaller text" onClick={() => changeScale(-0.1)} />
          <IconButton icon={Plus} label="Larger text" onClick={() => changeScale(0.1)} />
          {doc && doc.figures.length > 0 && <IconButton icon={Images} label={`Figures (${doc.figures.length})`} onClick={() => useStore.getState().openFigure(activeDocId, doc.figures[0].id)} />}
          <span className="toolbar-sep" aria-hidden />
          <ViewModeToggle />
        </div>
      </div>
      <div className="read-scroll" ref={scrollRef} onScroll={trackPosition} onWheel={dismissPending} onTouchMove={dismissPending} onMouseUp={() => setTimeout(readSelection, 0)} onKeyUp={(e) => e.shiftKey && readSelection()} onClick={onClickContent} tabIndex={0}>
        {!doc ? (
          <div className="viewer-loading">
            {reflow?.status === 'error' ? (
              <div className="viewer-error">
                {reflow.message ?? 'The reading view could not be built.'}
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-s" onClick={() => useStore.getState().setViewMode('pages')}>
                    Use the page view
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Loader2 size={22} className="spin" />
                <div>{reflow?.message ?? 'Preparing the reading view…'}</div>
                {reflow?.status === 'processing' && reflow.total ? (
                  <div className="progress-bar">
                    <span style={{ width: `${Math.round(((reflow.done ?? 0) / reflow.total) * 100)}%` }} />
                  </div>
                ) : null}
                <button type="button" className="btn btn-ghost btn-s" onClick={() => useStore.getState().setViewMode('pages')}>
                  Read the pages meanwhile
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="read-content" ref={contentRef} style={{ ['--read-scale' as string]: scale }}>
            <Content reviewId={review.id} docId={activeDocId} doc={doc} spans={spans} selectedNoteId={selectedNoteId} onOpenFigure={(id) => useStore.getState().openFigure(activeDocId, id)} />
            <div className="read-end">End of document</div>
          </div>
        )}
      </div>
      {pending && (
        <SelectionToolbar
          pending={{ docId: activeDocId, page: pending.page, rects: pending.rects, quote: pending.quote, anchor: pending.point, criterionName: pending.criterionName }}
          onPick={tag}
          onDismiss={() => {
            setPending(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </section>
  );
}

function nearestHeading(doc: { toc: { title: string; page: number }[] }, page: number): string {
  let best = '';
  for (const t of doc.toc) {
    if (t.page <= page) best = t.title;
    else break;
  }
  return best;
}

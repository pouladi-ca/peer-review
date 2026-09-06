import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFramework } from '../../hooks/useFramework';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, StretchHorizontal, PanelLeft, Loader2 } from 'lucide-react';
import { useStore, selectActiveDoc, selectActiveMeta } from '../../lib/store';
import { criterionForHint, sectionAt } from '../../lib/analyze/outline';
import { searchPages } from '../../lib/analyze/search';
import { mergeLineRects, rectContains } from '../../lib/geometry';
import type { NoteKind, Rect } from '../../lib/types';
import { PdfPage } from './PdfPage';
import { ViewModeToggle } from './ViewModeToggle';
import { rectsForQuote } from '../../lib/reflow/locate';
import { SelectionToolbar, type PendingSelection } from './SelectionToolbar';
import { IconButton, KIND_META } from '../ui';
import { isTyping } from '../../hooks/useGlobal';
import { isTouchLike } from '../../hooks/useMedia';

const GAP = 18;
const PAD = 24;
/** Pages never fit wider than this at 100%, so focus mode on a wide screen stays readable. */
const MAX_FIT = 1100;

export function PdfViewer() {
  const doc = useStore(selectActiveDoc);
  const meta = useStore(selectActiveMeta);
  const review = useStore((s) => s.review)!;
  const zoom = useStore((s) => s.zoom);
  const fitMode = useStore((s) => s.fitMode);
  const page = useStore((s) => s.page);
  const jump = useStore((s) => s.jump);
  const navOpen = useStore((s) => s.navOpen);
  const focusMode = useStore((s) => s.focusMode);
  const selectedNoteId = useStore((s) => s.selectedNoteId);
  const searchQuery = useStore((s) => s.searchQuery);
  const navTab = useStore((s) => s.navTab);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Zero until the scroll container is measured: laying pages out at a guessed width and
  // restoring the scroll position against it put phones on the wrong page.
  const [containerW, setContainerW] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(0);
  const measured = containerW > 0 && viewH > 0;
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [flash, setFlash] = useState<{ page: number; rect: Rect; id: number } | null>(null);
  const fw = useFramework(review.frameworkId);

  // Pages render as soon as the PDF parses; text extraction continues behind the progress strip.
  const ready = doc?.status !== 'error' && doc?.pdf && doc.dims;
  const dims = useMemo(() => (ready ? doc.dims! : []), [ready, doc]);

  // Layout: fit every page to the container width individually, then apply
  // zoom. Applications often mix portrait pages with landscape budget tables or
  // Gantt charts; per-page fitting keeps each readable at its natural width.
  const fitW = Math.min(MAX_FIT, Math.max(120, containerW - PAD * 2));
  const fitH = Math.max(160, viewH - PAD * 2);
  const layout = useMemo(() => {
    if (!measured) return [];
    let top = PAD;
    return dims.map((d) => {
      const byWidth = fitW / Math.max(1, d.w);
      const base = fitMode === 'page' ? Math.min(byWidth, fitH / Math.max(1, d.h)) : byWidth;
      const scale = Math.max(0.2, base * zoom);
      const w = d.w * scale;
      const h = d.h * scale;
      const entry = { top, w, h, scale };
      top += h + GAP;
      return entry;
    });
  }, [dims, fitW, fitH, fitMode, zoom, measured]);
  const totalH = layout.length ? layout[layout.length - 1].top + layout[layout.length - 1].h + PAD : 0;

  // When the layout changes (zoom, fit mode, a resize, a rotated phone), keep the same
  // point of the same page under the top of the viewport instead of the same pixel offset.
  const prevLayout = useRef<typeof layout>([]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevLayout.current;
    prevLayout.current = layout;
    if (!el || !prev.length || !layout.length || prev === layout) return;
    const top = el.scrollTop;
    let i = 0;
    for (let k = 0; k < prev.length; k++) if (prev[k].top <= top) i = k;
    if (!layout[i]) return;
    const frac = Math.max(0, Math.min(1, (top - prev[i].top) / Math.max(1, prev[i].h)));
    el.scrollTop = layout[i].top + frac * layout[i].h;
  }, [layout]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerW(el.clientWidth);
      setViewH(el.clientHeight);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, [navOpen, focusMode]);

  // Track scroll position, derive the current page.
  const raf = useRef(0);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
    });
  }, []);
  // A deliberate scroll dismisses a pending selection; programmatic scrolls do not.
  const dismissPending = useCallback(() => setPending((cur) => (cur ? null : cur)), []);
  // Dragging a selection handle on a touch screen is a touchmove too; the docked toolbar
  // must survive it, so only a scroll with no live selection dismisses it.
  const dismissOnTouchScroll = useCallback(() => {
    if (window.getSelection()?.isCollapsed ?? true) dismissPending();
  }, [dismissPending]);

  // Restore the last page when a document becomes ready.
  const restoredFor = useRef<string | null>(null);

  useEffect(() => {
    // Until the shared position has been restored, the scroll offset says nothing about
    // where the reviewer is; publishing it would overwrite the page they came from.
    if (!layout.length || !doc || restoredFor.current !== doc.id) return;
    const probe = scrollTop + Math.min(viewH * 0.35, 300);
    let cur = 1;
    for (let i = 0; i < layout.length; i++) {
      if (layout[i].top <= probe) cur = i + 1;
      else break;
    }
    useStore.getState().setPage(cur);
  }, [scrollTop, layout, viewH, doc]);

  useEffect(() => {
    if (!ready || !doc || !layout.length) return;
    if (restoredFor.current === doc.id) return;
    restoredFor.current = doc.id;
    const last = review.lastPage[doc.id] ?? 1;
    const el = scrollRef.current;
    if (el && last > 1 && layout[last - 1]) {
      el.scrollTop = layout[last - 1].top - PAD;
      setScrollTop(el.scrollTop);
      useStore.getState().announceResume(doc.id, last, sectionAt(doc.outline, last, 1)?.title);
    }
  }, [ready, doc, layout, review.lastPage]);

  // Handle jump requests.
  const lastJump = useRef<number | null>(null);
  useEffect(() => {
    if (!jump || !ready || !doc || jump.docId !== doc.id || !layout.length) return;
    if (lastJump.current === jump.token) return;
    lastJump.current = jump.token;
    const el = scrollRef.current;
    const l = layout[jump.page - 1];
    if (!el || !l) return;
    const target = jump.rect ? l.top + jump.rect.y * l.h - Math.min(160, viewH * 0.25) : l.top - PAD;
    const far = Math.abs(el.scrollTop - target) > viewH * 3;
    el.scrollTo({ top: Math.max(0, target), behavior: far ? 'auto' : 'smooth' });
    if (jump.rect) {
      const r = jump.rect;
      setFlash({ page: jump.page, rect: { x: Math.max(0, r.x - 0.004), y: Math.max(0, r.y - 0.004), w: Math.min(1, r.w + 0.008), h: r.h + 0.008 }, id: Date.now() });
    }
  }, [jump, ready, doc, layout, viewH]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  // Selection handling.
  const readSelection = useCallback(() => {
    const el = scrollRef.current;
    const sel = window.getSelection();
    if (!el || !doc || !sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : (range.startContainer as Element);
    const pageEl = startNode?.closest<HTMLElement>('.pdf-page');
    if (!pageEl || !el.contains(pageEl)) {
      setPending(null);
      return;
    }
    const pageNum = Number(pageEl.dataset.page);
    const pr = pageEl.getBoundingClientRect();
    const raw = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1 && r.left >= pr.left - 2 && r.right <= pr.right + 2 && r.top >= pr.top - 2 && r.bottom <= pr.bottom + 2);
    if (!raw.length) {
      setPending(null);
      return;
    }
    const rects = mergeLineRects(raw.map((r) => ({ x: (r.left - pr.left) / pr.width, y: (r.top - pr.top) / pr.height, w: r.width / pr.width, h: r.height / pr.height })));
    const rawQuote = sel.toString().replace(/\s+/g, ' ').trim();
    const quote = doc.ligatures ? doc.ligatures.fix(rawQuote) : rawQuote;
    if (!quote) {
      setPending(null);
      return;
    }
    const first = raw.reduce((a, b) => (b.top < a.top ? b : a));
    const last = raw.reduce((a, b) => (b.bottom > a.bottom ? b : a));
    const below = first.top < 90;
    const anchorRect = below ? last : first;
    const section = sectionAt(doc.outline, pageNum, rects[0].y);
    const crit = review.focusCriterionId ?? criterionForHint(fw, section?.criterionHint);
    const critName = fw.criteria.find((c) => c.id === crit)?.short;
    setPending({ docId: doc.id, page: pageNum, rects, quote, anchor: { x: (anchorRect.left + anchorRect.right) / 2, y: below ? anchorRect.bottom : anchorRect.top, below }, criterionName: critName });
  }, [doc, fw, review.focusCriterionId]);

  const tag = useCallback(
    (kind: NoteKind) => {
      if (!pending || !doc) return;
      const section = sectionAt(doc.outline, pending.page, pending.rects[0].y);
      const criterionId = review.focusCriterionId ?? criterionForHint(fw, section?.criterionHint);
      useStore.getState().addAnnotation({ docId: pending.docId, page: pending.page, rects: pending.rects, quote: pending.quote, kind, criterionId, severity: kind === 'weakness' ? 'minor' : undefined });
      window.getSelection()?.removeAllRanges();
      setPending(null);
      useStore.getState().notify(`${KIND_META[kind].label} added on page ${pending.page}`, 'success');
    },
    [pending, doc, fw, review.focusCriterionId],
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

  const onMouseUp = useCallback(() => {
    setTimeout(readSelection, 0);
  }, [readSelection]);

  // Touch devices adjust a selection by dragging its handles, which fires no pointer
  // event on the container; follow `selectionchange` instead, debounced.
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

  // Notes made in the reading view carry no page rectangles; locate their quote here.
  const annotationsByPage = useMemo(() => {
    const m = new Map<number, typeof review.annotations>();
    for (const a of review.annotations) {
      if (!doc || a.docId !== doc.id) continue;
      let note = a;
      if (!a.rects.length && doc.status === 'ready') {
        const pageText = doc.pages[a.page - 1];
        const rects = pageText ? rectsForQuote(pageText, a.quote) : [];
        if (rects.length) note = { ...a, rects };
      }
      m.set(a.page, [...(m.get(a.page) ?? []), note]);
    }
    return m;
  }, [review.annotations, doc]);

  const onClickPage = useCallback(
    (e: React.MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const pageEl = (e.target as HTMLElement).closest<HTMLElement>('.pdf-page');
      if (!pageEl || !doc) return;
      const pr = pageEl.getBoundingClientRect();
      const x = (e.clientX - pr.left) / pr.width;
      const y = (e.clientY - pr.top) / pr.height;
      const pageNum = Number(pageEl.dataset.page);
      const hit = (annotationsByPage.get(pageNum) ?? []).find((a) => a.rects.some((r) => rectContains(r, x, y)));
      const s = useStore.getState();
      if (hit) {
        s.selectNote(hit.id);
        s.setTab('notes');
      } else if (s.selectedNoteId) s.selectNote(null);
    },
    [doc, annotationsByPage],
  );

  const searchHits = useMemo(() => (doc && navTab === 'search' && searchQuery.length >= 2 ? searchPages(doc.id, doc.pages, searchQuery) : []), [doc, searchQuery, navTab]);

  const visibleRange = useMemo(() => {
    const lo = scrollTop - viewH;
    const hi = scrollTop + viewH * 2;
    const set = new Set<number>();
    layout.forEach((l, i) => {
      if (l.top + l.h >= lo && l.top <= hi) set.add(i + 1);
    });
    return set;
  }, [layout, scrollTop, viewH]);


  const total = meta?.pages ?? doc?.pages.length ?? 0;
  const section = doc ? sectionAt(doc.outline, page, 1) : undefined;

  const goto = (p: number) => {
    if (!doc) return;
    const clamped = Math.max(1, Math.min(total, p));
    useStore.getState().jumpTo({ docId: doc.id, page: clamped });
  };

  return (
    <section className="viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-group">
          {!focusMode && <IconButton icon={PanelLeft} label="Toggle navigator (\\)" active={navOpen} onClick={() => useStore.getState().toggleNav()} />}
          <IconButton icon={ChevronLeft} label="Previous page ([)" onClick={() => goto(page - 1)} disabled={page <= 1} />
          <span className="page-ctrl">
            <input
              type="number"
              min={1}
              max={total || 1}
              value={page}
              onChange={(e) => goto(Number(e.target.value))}
              onFocus={(e) => e.target.select()}
              aria-label="Page number"
            />
            <span>/ {total || '–'}</span>
          </span>
          <IconButton icon={ChevronRight} label="Next page (])" onClick={() => goto(page + 1)} disabled={page >= total} />
        </div>
        <div className="viewer-section" title={section?.title}>
          {section?.title ?? (meta?.name ?? '')}
        </div>
        <div className="viewer-toolbar-group">
          <IconButton icon={ZoomOut} label="Zoom out (-)" onClick={() => useStore.getState().setZoom(zoom - 0.1)} />
          <button type="button" className="zoom-value" onClick={() => useStore.getState().setZoom(1)} title={`Reset to 100% of fit ${fitMode}`}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton icon={ZoomIn} label="Zoom in (+)" onClick={() => useStore.getState().setZoom(zoom + 0.1)} />
          <span className="toolbar-sep" aria-hidden />
          <IconButton icon={StretchHorizontal} label="Fit width" active={fitMode === 'width'} onClick={() => useStore.getState().setFitMode('width')} />
          <IconButton icon={Maximize} label="Fit whole page" active={fitMode === 'page'} onClick={() => useStore.getState().setFitMode('page')} />
          <span className="toolbar-sep" aria-hidden />
          <ViewModeToggle />
        </div>
      </div>
      <div
        className="viewer-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={dismissPending}
        onTouchMove={dismissOnTouchScroll}
        onMouseUp={onMouseUp}
        onTouchEnd={() => setTimeout(readSelection, 250)}
        onKeyUp={(e) => e.shiftKey && onMouseUp()}
        onClick={onClickPage}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          const tl = t.closest('.textLayer');
          if (tl) tl.classList.add('selecting');
          const clear = () => {
            document.querySelectorAll('.textLayer.selecting').forEach((x) => x.classList.remove('selecting'));
            window.removeEventListener('mouseup', clear);
          };
          window.addEventListener('mouseup', clear);
        }}
        tabIndex={0}
      >
        {!ready ? (
          <div className="viewer-loading">
            {doc?.status === 'error' ? (
              <div className="viewer-error">{doc.error}</div>
            ) : (
              <>
                <Loader2 size={22} className="spin" />
                <div>Opening {meta?.name ?? 'the document'}…</div>
                <div className="progress-bar">
                  <span style={{ width: `${Math.round((doc?.progress ?? 0) * 100)}%` }} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="pages" style={{ height: totalH }}>
            {layout.map((l, i) => (
              <div key={i} className="page-slot" style={{ top: l.top, width: l.w, height: l.h, left: `calc(50% - ${l.w / 2}px)` }}>
                <PdfPage
                  pdf={doc.pdf!}
                  pageNumber={i + 1}
                  width={l.w}
                  height={l.h}
                  scale={l.scale}
                  visible={visibleRange.has(i + 1)}
                  annotations={annotationsByPage.get(i + 1) ?? []}
                  selectedId={selectedNoteId}
                  searchRects={searchHits.filter((h) => h.page === i + 1).map((h) => h.rect)}
                  flash={flash && flash.page === i + 1 ? flash.rect : null}
                  onMarkerClick={(id) => {
                    const s = useStore.getState();
                    s.selectNote(id);
                    s.setTab('notes');
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {pending && (
        <SelectionToolbar
          pending={pending}
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

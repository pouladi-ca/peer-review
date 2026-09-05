import { useEffect } from 'react';
import { useStore } from '../lib/store';

export function isTyping(e: KeyboardEvent | Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** Keyboard shortcuts that apply everywhere in the workspace. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setPalette(!s.paletteOpen);
        return;
      }
      if (e.key === 'Escape') {
        if (s.paletteOpen) s.setPalette(false);
        else if (s.helpOpen) s.setHelp(false);
        else if (s.frameworkEditor.open) s.closeFrameworkEditor();
        else if (s.editingNoteId) s.editNote(null);
        else if (s.focusMode) s.toggleFocus();
        return;
      }
      if (!s.review || isTyping(e)) return;
      if (meta && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        s.setNavTab('search');
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.nav-search input')?.focus());
        return;
      }
      if (meta) return;
      // Tagging keys with nothing selected: explain instead of staying silent.
      if (/^[swqn]$/i.test(e.key) && !e.altKey) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          s.notify('Select a passage in the document first, then press S, W, Q, or N to tag it.', 'info');
          return;
        }
      }
      switch (e.key) {
        case '?':
          e.preventDefault();
          s.setHelp(!s.helpOpen);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          s.setTab((['brief', 'notes', 'score', 'checklist', 'draft'] as const)[Number(e.key) - 1]);
          break;
        case 'f':
          s.toggleFocus();
          break;
        case '\\':
          s.toggleNav();
          break;
        case '[':
          if (s.page > 1) s.jumpTo({ docId: s.activeDocId!, page: s.page - 1 });
          break;
        case ']': {
          const meta = s.review.docs.find((d) => d.id === s.activeDocId);
          if (meta && s.page < meta.pages) s.jumpTo({ docId: s.activeDocId!, page: s.page + 1 });
          break;
        }
        case '=':
        case '+':
          s.setZoom(s.zoom + 0.1);
          break;
        case '-':
          s.setZoom(s.zoom - 0.1);
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Counts the time the reviewer is actively working on the open review. */
export function useActiveTimer() {
  useEffect(() => {
    let last = Date.now();
    const bump = () => (last = Date.now());
    const events = ['keydown', 'mousemove', 'mousedown', 'scroll', 'wheel', 'touchstart'];
    for (const ev of events) window.addEventListener(ev, bump, { passive: true, capture: true });
    const TICK = 10_000;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last > 120_000) return;
      useStore.getState().tickActive(TICK);
    }, TICK);
    return () => {
      clearInterval(id);
      for (const ev of events) window.removeEventListener(ev, bump, { capture: true } as EventListenerOptions);
    };
  }, []);
}

/** Warn before the tab closes while a save is pending. */
export function useUnloadGuard() {
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const s = useStore.getState();
      if (s.saveState === 'saving' || s.sync.pending > 0) e.preventDefault();
    };
    const flush = () => {
      if (document.visibilityState === 'hidden' && useStore.getState().authed) void useStore.getState().syncNow();
    };
    window.addEventListener('beforeunload', h);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', h);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);
}

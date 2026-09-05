import { create } from 'zustand';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { db } from './db';
import { detectFramework, getFramework, setCustomFrameworks, type CustomFrameworkDef } from './frameworks';
import { getSetting, setSetting } from './db';
import { extractAllPages, loadPdf, repairLigatures, type PDFDocumentProxy } from './pdf';
import type { LigatureRepair } from './analyze/ligatures';
import { detectOutline } from './analyze/outline';
import { extractFacts } from './analyze/facts';
import type { Annotation, DocMeta, DocRole, NoteKind, OutlineEntry, PageText, QuickFacts, Rect, Review } from './types';

export type PanelTab = 'brief' | 'notes' | 'score' | 'checklist' | 'draft';
export type NavTab = 'outline' | 'search' | 'pages';
export type Theme = 'light' | 'dark' | 'system';

export interface RuntimeDoc {
  id: string;
  pdf?: PDFDocumentProxy;
  pages: PageText[];
  outline: OutlineEntry[];
  facts: QuickFacts;
  status: 'loading' | 'ready' | 'error';
  progress: number;
  error?: string;
  /** Present when the PDF had unmapped ligature glyphs that were repaired. */
  ligatures?: LigatureRepair;
}

export interface Jump {
  docId: string;
  page: number;
  rect?: Rect;
  flashNoteId?: string;
  token: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export interface NoteFilter {
  kinds: NoteKind[];
  criterionId?: string; // 'none' = unassigned
  query: string;
}

interface State {
  booted: boolean;
  reviews: Review[];
  review: Review | null;
  docs: Record<string, RuntimeDoc>;
  activeDocId: string | null;
  tab: PanelTab;
  navTab: NavTab;
  page: number;
  zoom: number;
  theme: Theme;
  focusMode: boolean;
  navOpen: boolean;
  selectedNoteId: string | null;
  editingNoteId: string | null;
  paletteOpen: boolean;
  helpOpen: boolean;
  toast: Toast | null;
  jump: Jump | null;
  searchQuery: string;
  filter: NoteFilter;
  saveState: 'idle' | 'saving' | 'saved';
  busy: string | null;
  customFrameworks: CustomFrameworkDef[];
  /** Bumped whenever the set of frameworks changes so views re-resolve them. */
  frameworksVersion: number;
  frameworkEditor: { open: boolean; id?: string };

  boot(): Promise<void>;
  createReview(files: File[], opts?: { frameworkId?: string }): Promise<string>;
  openReview(id: string): Promise<void>;
  closeReview(): void;
  deleteReview(id: string): Promise<void>;
  addDocument(file: File, role: DocRole): Promise<void>;
  removeDocument(docId: string): Promise<void>;
  setActiveDoc(docId: string): void;
  update(mutator: (r: Review) => void): void;
  addAnnotation(a: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt' | 'comment'> & { comment?: string }): string;
  updateAnnotation(id: string, patch: Partial<Annotation>): void;
  deleteAnnotation(id: string): void;
  setTab(tab: PanelTab): void;
  setNavTab(tab: NavTab): void;
  setPage(page: number): void;
  setZoom(zoom: number): void;
  setTheme(theme: Theme): void;
  toggleFocus(): void;
  toggleNav(): void;
  selectNote(id: string | null): void;
  editNote(id: string | null): void;
  jumpTo(j: Omit<Jump, 'token'>): void;
  notify(text: string, kind?: Toast['kind']): void;
  setSearch(q: string): void;
  setFilter(f: Partial<NoteFilter>): void;
  setPalette(open: boolean): void;
  setHelp(open: boolean): void;
  setFramework(id: string): void;
  tickActive(ms: number): void;
  importReview(review: Review, files: { id: string; name: string; blob: Blob }[]): Promise<void>;
  saveCustomFramework(def: CustomFrameworkDef): Promise<void>;
  deleteCustomFramework(id: string): Promise<boolean>;
  openFrameworkEditor(id?: string): void;
  closeFrameworkEditor(): void;
}

function destroyPdf(pdf?: PDFDocumentProxy): void {
  (pdf as unknown as { destroy?: () => Promise<void> } | undefined)?.destroy?.().catch(() => undefined);
}

export function newReview(partial: Partial<Review> = {}): Review {
  const now = Date.now();
  return {
    id: nanoid(10),
    title: 'Untitled review',
    createdAt: now,
    updatedAt: now,
    frameworkId: 'generic',
    docs: [],
    annotations: [],
    scores: {},
    overall: { comment: '' },
    checklist: {},
    draft: { summary: '', additional: '', confidential: '' },
    facts: {},
    visited: {},
    lastPage: {},
    activeMs: 0,
    ...partial,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('panelist.theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export const useStore = create<State>((set, get) => {
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    set({ saveState: 'saving' });
    saveTimer = setTimeout(async () => {
      const r = get().review;
      if (!r) return;
      try {
        await db.reviews.put(r);
        set((s) => ({ saveState: 'saved', reviews: s.reviews.map((x) => (x.id === r.id ? r : x)) }));
      } catch (e) {
        console.error(e);
        set({ saveState: 'idle' });
        get().notify('Could not save to browser storage.', 'error');
      }
    }, 500);
  };

  const loadRuntimeDoc = async (docId: string, blob: Blob) => {
    set((s) => ({ docs: { ...s.docs, [docId]: { id: docId, pages: [], outline: [], facts: {}, status: 'loading', progress: 0 } } }));
    try {
      const buf = await blob.arrayBuffer();
      const pdf = await loadPdf(buf);
      set((s) => ({ docs: { ...s.docs, [docId]: { ...s.docs[docId], pdf } } }));
      const pages = await extractAllPages(pdf, (done, total) => {
        set((s) => ({ docs: { ...s.docs, [docId]: { ...s.docs[docId], progress: done / total } } }));
      });
      const ligatures = repairLigatures(pages);
      const review = get().review;
      const fw = review ? getFramework(review.frameworkId) : undefined;
      const outline = detectOutline(pages, fw);
      const facts = extractFacts(pages);
      set((s) => ({ docs: { ...s.docs, [docId]: { id: docId, pdf, pages, outline, facts, status: 'ready', progress: 1, ligatures: ligatures.count ? ligatures : undefined } } }));
      return { pages, facts };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((s) => ({ docs: { ...s.docs, [docId]: { ...s.docs[docId], status: 'error', error: msg } } }));
      return null;
    }
  };

  return {
    booted: false,
    reviews: [],
    review: null,
    docs: {},
    activeDocId: null,
    tab: 'brief',
    navTab: 'outline',
    page: 1,
    zoom: 1,
    theme: readTheme(),
    focusMode: false,
    navOpen: true,
    selectedNoteId: null,
    editingNoteId: null,
    paletteOpen: false,
    helpOpen: false,
    toast: null,
    jump: null,
    searchQuery: '',
    filter: { kinds: ['strength', 'weakness', 'question', 'note'], query: '' },
    saveState: 'idle',
    busy: null,
    customFrameworks: [],
    frameworksVersion: 0,
    frameworkEditor: { open: false },

    async boot() {
      applyTheme(get().theme);
      try {
        const defs = await getSetting<CustomFrameworkDef[]>('customFrameworks', []);
        setCustomFrameworks(defs);
        set((s) => ({ customFrameworks: defs, frameworksVersion: s.frameworksVersion + 1 }));
        const reviews = await db.reviews.orderBy('updatedAt').reverse().toArray();
        set({ reviews, booted: true });
      } catch (e) {
        console.error(e);
        set({ booted: true });
        get().notify('Browser storage is unavailable; your work will not persist.', 'error');
      }
    },

    async createReview(files, opts = {}) {
      set({ busy: 'Reading your PDF…' });
      const review = newReview({ frameworkId: opts.frameworkId ?? 'generic' });
      const first = files[0];
      review.title = first.name.replace(/\.pdf$/i, '');
      for (const [i, file] of files.entries()) {
        const id = nanoid(10);
        review.docs.push({ id, name: file.name, size: file.size, pages: 0, addedAt: Date.now(), role: i === 0 ? 'application' : 'supporting' });
        await db.files.put({ id, reviewId: review.id, name: file.name, blob: file });
      }
      await db.reviews.put(review);
      set((s) => ({ reviews: [review, ...s.reviews], review, activeDocId: review.docs[0].id, page: 1, tab: 'brief', docs: {}, selectedNoteId: null, editingNoteId: null }));
      for (const [i, doc] of review.docs.entries()) {
        const res = await loadRuntimeDoc(doc.id, files[i]);
        const pdf = get().docs[doc.id]?.pdf;
        get().update((r) => {
          const d = r.docs.find((x) => x.id === doc.id);
          if (d && pdf) d.pages = pdf.numPages;
          if (i === 0 && res) {
            r.facts = res.facts;
            if (res.facts.title && res.facts.title.length <= 160) r.title = res.facts.title;
            if (!opts.frameworkId) {
              const detected = detectFramework(res.pages.map((p) => p.text).join('\n'));
              if (detected) r.frameworkId = detected;
            }
          }
        });
      }
      set({ busy: null });
      return review.id;
    },

    async openReview(id) {
      const review = await db.reviews.get(id);
      if (!review) {
        get().notify('That review no longer exists.', 'error');
        return;
      }
      const activeDocId = review.docs[0]?.id ?? null;
      set({ review, activeDocId, docs: {}, page: activeDocId ? review.lastPage[activeDocId] ?? 1 : 1, tab: 'brief', selectedNoteId: null, editingNoteId: null, searchQuery: '' });
      for (const doc of review.docs) {
        const file = await db.files.get(doc.id);
        if (!file) {
          set((s) => ({ docs: { ...s.docs, [doc.id]: { id: doc.id, pages: [], outline: [], facts: {}, status: 'error', progress: 0, error: 'The PDF for this document is missing from storage.' } } }));
          continue;
        }
        const res = await loadRuntimeDoc(doc.id, file.blob);
        if (res && doc.role === 'application' && Object.keys(get().review?.facts ?? {}).length === 0) {
          get().update((r) => {
            r.facts = res.facts;
          });
        }
      }
    },

    closeReview() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        const r = get().review;
        if (r) db.reviews.put(r).catch(console.error);
      }
      for (const d of Object.values(get().docs)) destroyPdf(d.pdf);
      set({ review: null, docs: {}, activeDocId: null, selectedNoteId: null, editingNoteId: null, focusMode: false, saveState: 'idle' });
      get().boot();
    },

    async deleteReview(id) {
      await db.files.where('reviewId').equals(id).delete();
      await db.reviews.delete(id);
      set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }));
    },

    async addDocument(file, role) {
      const r = get().review;
      if (!r) return;
      const id = nanoid(10);
      await db.files.put({ id, reviewId: r.id, name: file.name, blob: file });
      get().update((rv) => {
        rv.docs.push({ id, name: file.name, size: file.size, pages: 0, addedAt: Date.now(), role });
      });
      set({ activeDocId: id, page: 1 });
      await loadRuntimeDoc(id, file);
      const pdf = get().docs[id]?.pdf;
      get().update((rv) => {
        const d = rv.docs.find((x) => x.id === id);
        if (d && pdf) d.pages = pdf.numPages;
      });
      get().notify(`Added ${file.name}`, 'success');
    },

    async removeDocument(docId) {
      const r = get().review;
      if (!r || r.docs.length <= 1) return;
      await db.files.delete(docId);
      get().update((rv) => {
        rv.docs = rv.docs.filter((d) => d.id !== docId);
        rv.annotations = rv.annotations.filter((a) => a.docId !== docId);
        delete rv.visited[docId];
        delete rv.lastPage[docId];
      });
      const docs = { ...get().docs };
      destroyPdf(docs[docId]?.pdf);
      delete docs[docId];
      set({ docs, activeDocId: get().review?.docs[0]?.id ?? null, page: 1 });
    },

    setActiveDoc(docId) {
      const r = get().review;
      set({ activeDocId: docId, page: r?.lastPage[docId] ?? 1, selectedNoteId: null });
    },

    update(mutator) {
      const r = get().review;
      if (!r) return;
      const next = produce(r, (draft) => {
        mutator(draft);
        draft.updatedAt = Date.now();
      });
      if (next !== r) {
        set({ review: next });
        scheduleSave();
      }
    },

    addAnnotation(a) {
      const id = nanoid(8);
      const now = Date.now();
      get().update((r) => {
        r.annotations.push({ ...a, comment: a.comment ?? '', id, createdAt: now, updatedAt: now });
      });
      set({ selectedNoteId: id, editingNoteId: id, tab: 'notes' });
      return id;
    },

    updateAnnotation(id, patch) {
      get().update((r) => {
        const a = r.annotations.find((x) => x.id === id);
        if (a) Object.assign(a, patch, { updatedAt: Date.now() });
      });
    },

    deleteAnnotation(id) {
      get().update((r) => {
        r.annotations = r.annotations.filter((x) => x.id !== id);
      });
      set((s) => ({ selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId, editingNoteId: s.editingNoteId === id ? null : s.editingNoteId }));
    },

    setTab: (tab) => set({ tab }),
    setNavTab: (navTab) => set({ navTab, navOpen: true }),

    setPage(page) {
      const { activeDocId, review } = get();
      if (page === get().page) return;
      set({ page });
      if (!activeDocId || !review) return;
      const visited = review.visited[activeDocId] ?? [];
      if (!visited.includes(page) || review.lastPage[activeDocId] !== page) {
        get().update((r) => {
          const v = r.visited[activeDocId] ?? [];
          if (!v.includes(page)) r.visited[activeDocId] = [...v, page];
          r.lastPage[activeDocId] = page;
        });
      }
    },

    setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.5, Math.round(zoom * 100) / 100)) }),

    setTheme(theme) {
      applyTheme(theme);
      try {
        localStorage.setItem('panelist.theme', theme);
      } catch {
        /* ignore */
      }
      set({ theme });
    },

    toggleFocus: () => set((s) => ({ focusMode: !s.focusMode })),
    toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
    selectNote: (id) => set({ selectedNoteId: id }),
    editNote: (id) => set({ editingNoteId: id, selectedNoteId: id ?? get().selectedNoteId }),

    jumpTo(j) {
      const r = get().review;
      if (j.docId !== get().activeDocId) set({ activeDocId: j.docId, page: r?.lastPage[j.docId] ?? 1 });
      set({ jump: { ...j, token: Date.now() + Math.random() } });
    },

    notify(text, kind = 'info') {
      if (toastTimer) clearTimeout(toastTimer);
      const id = Date.now();
      set({ toast: { id, text, kind } });
      toastTimer = setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : {})), 3200);
    },

    setSearch: (searchQuery) => set({ searchQuery }),
    setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
    setPalette: (paletteOpen) => set({ paletteOpen, helpOpen: false }),
    setHelp: (helpOpen) => set({ helpOpen, paletteOpen: false }),

    setFramework(id) {
      get().update((r) => {
        r.frameworkId = id;
      });
      // Re-run outline detection with the new framework's expected sections.
      const fw = getFramework(id);
      set((s) => ({ docs: Object.fromEntries(Object.entries(s.docs).map(([k, d]) => [k, d.status === 'ready' ? { ...d, outline: detectOutline(d.pages, fw) } : d])) }));
    },

    tickActive(ms) {
      const r = get().review;
      if (!r) return;
      const next = { ...r, activeMs: r.activeMs + ms };
      set({ review: next });
      scheduleSave();
    },

    async importReview(review, files) {
      for (const f of files) await db.files.put({ id: f.id, reviewId: review.id, name: f.name, blob: f.blob });
      await db.reviews.put(review);
      set((s) => ({ reviews: [review, ...s.reviews.filter((r) => r.id !== review.id)] }));
    },

    async saveCustomFramework(def) {
      const next = [...get().customFrameworks.filter((d) => d.id !== def.id), { ...def, updatedAt: Date.now() }].sort((a, b) => a.name.localeCompare(b.name));
      setCustomFrameworks(next);
      set((s) => ({ customFrameworks: next, frameworksVersion: s.frameworksVersion + 1 }));
      await setSetting('customFrameworks', next);
      // Re-run outline detection if the open review uses this framework.
      const r = get().review;
      if (r && r.frameworkId === def.id) {
        const fw = getFramework(def.id);
        set((s) => ({ docs: Object.fromEntries(Object.entries(s.docs).map(([k, d]) => [k, d.status === 'ready' ? { ...d, outline: detectOutline(d.pages, fw) } : d])) }));
      }
    },

    async deleteCustomFramework(id) {
      const inUse = get().reviews.some((r) => r.frameworkId === id) || get().review?.frameworkId === id;
      if (inUse) {
        get().notify('That framework is used by a review. Switch the review to another framework first.', 'error');
        return false;
      }
      const next = get().customFrameworks.filter((d) => d.id !== id);
      setCustomFrameworks(next);
      set((s) => ({ customFrameworks: next, frameworksVersion: s.frameworksVersion + 1 }));
      await setSetting('customFrameworks', next);
      return true;
    },

    openFrameworkEditor: (id) => set({ frameworkEditor: { open: true, id }, paletteOpen: false, helpOpen: false }),
    closeFrameworkEditor: () => set({ frameworkEditor: { open: false } }),
  };
});

/** Convenience selectors. */
export const selectActiveDoc = (s: State): RuntimeDoc | undefined => (s.activeDocId ? s.docs[s.activeDocId] : undefined);
export const selectActiveMeta = (s: State): DocMeta | undefined => s.review?.docs.find((d) => d.id === s.activeDocId);

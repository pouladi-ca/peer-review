import { create } from 'zustand';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { db } from './db';
import { api, onUnauthorized, type Me } from './api';
import { SyncEngine, deviceId, type SyncStatus, PREFS_KEY, PHRASES_KEY } from './sync/engine';
import { detectFramework, getFramework, setCustomFrameworks, type CustomFrameworkDef, EMPTY_PREFS, type FrameworkPrefs, scoreLabel } from './frameworks';
import { getSetting, setSetting } from './db';
import { extractAllPages, loadPdf, pageDims, repairLigatures, type PDFDocumentProxy } from './pdf';
import { lazyLigatureRepair } from './analyze/ligatures';
import { EMPTY_PANEL } from './panel';
import type { PhraseUse, UserPhrase } from './writing/phrasebook';
import type { LigatureRepair } from './analyze/ligatures';
import type { ReflowDoc, ReflowStatus } from './reflow/types';
import { isTouchLike } from '../hooks/useMedia';
import { detectOutline } from './analyze/outline';
import { extractFacts } from './analyze/facts';
import type { Annotation, DocMeta, DocRole, NoteKind, OutlineEntry, PageText, QuickFacts, Rect, Review, PanelNotes } from './types';

export type PanelTab = 'brief' | 'notes' | 'score' | 'checklist' | 'draft';
export type NavTab = 'outline' | 'search' | 'pages';
export type Theme = 'light' | 'dark' | 'system';
/** How pages are sized at 100% zoom: to the container width, or so the whole page is visible. */
export type FitMode = 'width' | 'page';
/** Pages: the PDF as laid out. Read: the reflowed text with figure cards (phone-friendly). */
export type ViewMode = 'pages' | 'read';

export interface ReflowState {
  status: ReflowStatus['status'];
  done?: number;
  total?: number;
  message?: string;
  doc?: ReflowDoc;
}

export interface RuntimeDoc {
  id: string;
  pdf?: PDFDocumentProxy;
  /** Page sizes at scale 1, known as soon as the PDF parses. */
  dims?: { w: number; h: number }[];
  pages: PageText[];
  outline: OutlineEntry[];
  facts: QuickFacts;
  status: 'loading' | 'ready' | 'error';
  progress: number;
  /** What the import is doing right now, when the server is doing it. */
  message?: string;
  /** Where the text came from: the server's extractor, or pdf.js in this browser as a fallback. */
  source?: 'server' | 'browser';
  error?: string;
  /** Present when the PDF had unmapped ligature glyphs that were repaired. */
  ligatures?: LigatureRepair;
}

export interface Jump {
  docId: string;
  page: number;
  rect?: Rect;
  flashNoteId?: string;
  /** Reading view: scroll to this block instead of the page's first block. */
  blockId?: string;
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
  fitMode: FitMode;
  viewMode: ViewMode;
  /** Reflow (reading view) state per document id. */
  reflow: Record<string, ReflowState>;
  /** Figure open in the full-screen viewer: document and figure ids. */
  figureViewer: { docId: string; figureId: string } | null;
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
  /** PDF uploads in flight, by document id, for the progress strip. */
  transfers: Record<string, { name: string; fraction: number }>;
  customFrameworks: CustomFrameworkDef[];
  /** Pinned, hidden, and default frameworks for this reviewer's menus. */
  frameworkPrefs: FrameworkPrefs;
  /** Phrases this reviewer saved for reuse. */
  userPhrases: UserPhrase[];
  /** Bumped whenever the set of frameworks changes so views re-resolve them. */
  frameworksVersion: number;
  frameworkEditor: { open: boolean; id?: string };
  /** The meeting view is open over the workspace. */
  meetingOpen: boolean;
  /** The "send PDFs from your phone" dialog is open. */
  inboxOpen: boolean;
  /** The passkeys and devices dialog is open. */
  securityOpen: boolean;
  /** null while the session is being checked, then whether the reviewer is signed in. */
  authed: boolean | null;
  /** The signed-in account; null until known. */
  me: Me | null;
  adminOpen: boolean;
  passwordDialogOpen: boolean;
  sync: SyncStatus;
  /** Phones: which sheet is open over the document. */
  sheet: 'nav' | 'panel' | null;

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
  setFitMode(mode: FitMode): void;
  setViewMode(mode: ViewMode): void;
  /** Make sure the reading view exists for a document; polls until ready. */
  ensureReflow(docId: string): Promise<void>;
  openFigure(docId: string, figureId: string | null): void;
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
  openMeeting(): void;
  closeMeeting(): void;
  openInbox(): void;
  closeInbox(): void;
  openSecurity(): void;
  closeSecurity(): void;
  /** Open a review that may still be arriving through sync (from a share-sheet post). */
  openWhenSynced(id: string): Promise<void>;
  updatePanel(patch: Partial<PanelNotes>): void;
  logDiscussion(who: string, text: string): void;
  /** Record the score after discussion, with the reason, and log it. */
  reviseScore(score: number | string | undefined, reason: string): void;
  setFrameworkPrefs(patch: Partial<FrameworkPrefs>): Promise<void>;
  saveUserPhrase(text: string, use: PhraseUse): Promise<void>;
  deleteUserPhrase(id: string): Promise<void>;
  closeFrameworkEditor(): void;
  /** After a successful login: remember who is signed in, load data, and start syncing. */
  setSheet(sheet: 'nav' | 'panel' | null): void;
  /** Tell the reviewer where a freshly opened review resumed, once per opening. */
  announceResume(docId: string, page: number, section?: string): void;
  signedIn(me: Me): Promise<void>;
  signOut(everywhere?: boolean): Promise<void>;
  setMe(me: Me): void;
  openAdmin(): void;
  closeAdmin(): void;
  openPasswordDialog(): void;
  closePasswordDialog(): void;
  syncNow(): Promise<void>;
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

function readViewMode(): ViewMode {
  try {
    const v = localStorage.getItem('panelist.view');
    if (v === 'pages' || v === 'read') return v;
  } catch {
    /* ignore */
  }
  return isTouchLike() && window.innerWidth < 720 ? 'read' : 'pages';
}

function readFitMode(): FitMode {
  try {
    return localStorage.getItem('panelist.fit') === 'page' ? 'page' : 'width';
  } catch {
    return 'width';
  }
}

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

let engine: SyncEngine | null = null;
/** Review ids whose resume position has been announced this opening. */
const announced = new Set<string>();

/** Load every review from the local database into the list, newest first. */
async function loadReviewList(set: (partial: Partial<State>) => void): Promise<void> {
  const reviews = await db.reviews.orderBy('updatedAt').reverse().toArray();
  set({ reviews });
}

/** Wipe every locally cached review, file, and sync state on this device. */
async function clearLocalData(): Promise<void> {
  await Promise.all([db.reviews.clear(), db.files.clear(), db.outbox.clear(), db.syncstate.clear(), db.settings.delete('sync.cursor'), db.settings.delete('customFrameworks'), db.settings.delete('frameworkPrefs'), db.settings.delete('userPhrases'), db.settings.delete('auth.email')]);
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

  /** How long to wait for the server's extraction before falling back to pdf.js in this browser. */
  const SERVER_TEXT_TIMEOUT_MS = 5 * 60 * 1000;

  /**
   * Wait for the server's reflow of a document to finish (starting it if needed), mirroring
   * its progress into the runtime doc. Resolves with the final reflow status; 'none' means
   * we gave up waiting.
   */
  const awaitServerText = (reviewId: string, docId: string): Promise<ReflowState['status']> =>
    new Promise((resolve) => {
      let done = false;
      const finish = (status: ReflowState['status']) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsub();
        resolve(status);
      };
      const consider = (st: ReflowState | undefined) => {
        if (get().review?.id !== reviewId) return finish('none');
        if (!st) return;
        if (st.status === 'processing') {
          const progress = st.total ? Math.min(1, (st.done ?? 0) / st.total) : 0;
          set((s) => (s.docs[docId] ? { docs: { ...s.docs, [docId]: { ...s.docs[docId], progress, message: st.message } } } : {}));
        } else if (st.status === 'none' && st.message) {
          set((s) => (s.docs[docId] ? { docs: { ...s.docs, [docId]: { ...s.docs[docId], message: st.message } } } : {}));
        }
        if (st.status === 'ready' || st.status === 'error') finish(st.status);
      };
      let last = get().reflow[docId];
      const unsub = useStore.subscribe((s) => {
        const cur = s.reflow[docId];
        if (cur !== last) {
          last = cur;
          consider(cur);
        }
      });
      const timer = setTimeout(() => finish('none'), SERVER_TEXT_TIMEOUT_MS);
      consider(last);
      if (!done) void get().ensureReflow(docId);
    });

  /**
   * Parse a PDF and get its text. The viewer can show pages as soon as `onPdf` fires.
   * The text itself comes from the server's extractor (the same pass that builds the
   * reading view), so a phone only renders pages; pdf.js extracts in this browser only
   * when the server cannot: offline, an extraction failure, or an old reflow without
   * page text. Facts, outline, and search fill in when the text arrives.
   */
  const loadRuntimeDoc = async (reviewId: string, docId: string, blob: Blob, onPdf?: (pdf: PDFDocumentProxy) => void) => {
    set((s) => ({ docs: { ...s.docs, [docId]: { id: docId, pages: [], outline: [], facts: {}, status: 'loading', progress: 0 } } }));
    try {
      const buf = await blob.arrayBuffer();
      const pdf = await loadPdf(buf);
      const dims = await pageDims(pdf);
      set((s) => ({ docs: { ...s.docs, [docId]: { ...s.docs[docId], pdf, dims } } }));
      onPdf?.(pdf);

      let pages: PageText[] | null = null;
      let ligatures: LigatureRepair | undefined;
      let source: RuntimeDoc['source'] = 'server';
      const status = await awaitServerText(reviewId, docId);
      if (status === 'ready') {
        try {
          const got = (await api.reflowPages(reviewId, docId)).pages;
          if (got.length === pdf.numPages) pages = got;
        } catch (e) {
          console.warn('page text not available from the server; extracting here', e);
        }
      }
      if (get().review?.id !== reviewId) return null;
      if (pages) {
        ligatures = lazyLigatureRepair(pages.map((p) => p.text));
      } else {
        source = 'browser';
        set((s) => ({ docs: { ...s.docs, [docId]: { ...s.docs[docId], progress: 0, message: undefined } } }));
        pages = await extractAllPages(pdf, (done, total) => {
          set((s) => ({ docs: { ...s.docs, [docId]: { ...s.docs[docId], progress: done / total } } }));
        });
        const repaired = repairLigatures(pages);
        ligatures = repaired.count ? repaired : undefined;
      }
      const review = get().review;
      const fw = review ? getFramework(review.frameworkId) : undefined;
      const outline = detectOutline(pages, fw);
      const facts = extractFacts(pages);
      set((s) => ({ docs: { ...s.docs, [docId]: { id: docId, pdf, dims, pages, outline, facts, status: 'ready', progress: 1, source, ligatures } } }));
      return { pages, facts };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((s) => ({ docs: { ...s.docs, [docId]: { ...s.docs[docId], status: 'error', error: msg } } }));
      return null;
    }
  };

  const ensureEngine = (): SyncEngine => {
    if (engine) return engine;
    engine = new SyncEngine({
      currentReview: () => get().review,
      onStatus: (status) => set({ sync: status }),
      onAccountChanged: (defs) => {
        setCustomFrameworks(defs);
        set((s) => ({ customFrameworks: defs, frameworksVersion: s.frameworksVersion + 1 }));
      },
      onPrefsChanged: (prefs) => set({ frameworkPrefs: prefs }),
      onAccountPref: (key, data) => {
        if (key === PHRASES_KEY) set({ userPhrases: ((data as { phrases?: UserPhrase[] } | null)?.phrases ?? []).filter((p) => p && typeof p.text === 'string') });
      },
      onReviewChanged: (id, review) => {
        const s = get();
        if (review === null) {
          set({ reviews: s.reviews.filter((r) => r.id !== id) });
          if (s.review?.id === id) {
            get().closeReview();
            get().notify('This review was deleted on another device.', 'info');
          }
          return;
        }
        const exists = s.reviews.some((r) => r.id === id);
        set({ reviews: (exists ? s.reviews.map((r) => (r.id === id ? review : r)) : [review, ...s.reviews]).sort((a, b) => b.updatedAt - a.updatedAt) });
        if (s.review?.id === id) {
          set({ review });
          // A document added elsewhere: fetch and open it.
          for (const d of review.docs) if (!get().docs[d.id]) void loadDocFromAnywhere(review.id, d);
        }
      },
    });
    return engine;
  };

  /** Upload a PDF to the server, reporting progress in the strip and in the reading view's status. */
  const uploadDoc = async (reviewId: string, doc: DocMeta, blob: Blob): Promise<void> => {
    const setMsg = (message: string) => set((s) => ({ reflow: { ...s.reflow, [doc.id]: { ...(s.reflow[doc.id] ?? { status: 'none' }), status: 'none', message } } }));
    const setFraction = (fraction: number) => set((s) => ({ transfers: { ...s.transfers, [doc.id]: { name: doc.name, fraction } } }));
    setFraction(0);
    setMsg('Uploading the PDF to your server…');
    try {
      await api.uploadFile(reviewId, doc.id, blob, (f) => {
        setFraction(f);
        setMsg(`Uploading the PDF to your server… ${Math.round(f * 100)}%`);
      });
    } finally {
      set((s) => {
        const { [doc.id]: _done, ...rest } = s.transfers;
        return { transfers: rest };
      });
    }
  };

  /** Load a document's PDF from local storage, or download it from the server. */
  const loadDocFromAnywhere = async (reviewId: string, doc: DocMeta): Promise<void> => {
    let file = await db.files.get(doc.id);
    if (!file) {
      set((s) => ({ docs: { ...s.docs, [doc.id]: { id: doc.id, pages: [], outline: [], facts: {}, status: 'loading', progress: 0 } } }));
      try {
        const blob = await api.downloadFile(reviewId, doc.id);
        file = { id: doc.id, reviewId, name: doc.name, blob };
        await db.files.put(file);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        set((s) => ({ docs: { ...s.docs, [doc.id]: { id: doc.id, pages: [], outline: [], facts: {}, status: 'error', progress: 0, error: `${msg} Open this review on the device that added the PDF so it can finish uploading.` } } }));
        return;
      }
    }
    // A review made before sync existed has its PDF only in this browser: put it on the
    // server now so other devices, and the reading view, can have it.
    void (async () => {
      try {
        if (await api.fileExists(reviewId, doc.id)) return;
        await uploadDoc(reviewId, doc, file!.blob);
        if (get().review?.id === reviewId) void get().ensureReflow(doc.id);
      } catch (e) {
        console.error(e);
      }
    })();
    await loadRuntimeDoc(reviewId, doc.id, file.blob);
    const pdf = get().docs[doc.id]?.pdf;
    if (pdf && get().review?.docs.find((d) => d.id === doc.id)?.pages !== pdf.numPages) {
      get().update((r) => {
        const d = r.docs.find((x) => x.id === doc.id);
        if (d) d.pages = pdf.numPages;
      });
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
    fitMode: readFitMode(),
    viewMode: readViewMode(),
    reflow: {},
    figureViewer: null,
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
    transfers: {},
    customFrameworks: [],
    frameworkPrefs: EMPTY_PREFS,
    userPhrases: [],
    frameworksVersion: 0,
    frameworkEditor: { open: false },
    meetingOpen: false,
    inboxOpen: false,
    securityOpen: false,
    authed: null,
    me: null,
    adminOpen: false,
    passwordDialogOpen: false,
    sync: { state: 'idle', pending: 0 },
    sheet: null,

    async boot() {
      applyTheme(get().theme);
      onUnauthorized(() => {
        if (get().authed !== false) {
          engine?.stop();
          set({ authed: false, review: null, docs: {}, activeDocId: null });
        }
      });
      let me: Me | null;
      try {
        me = await api.session();
      } catch {
        // Server unreachable: allow the cached copy only on a device that has signed in before.
        me = null;
        try {
          const raw = localStorage.getItem('panelist.me');
          if (raw) me = JSON.parse(raw) as Me;
        } catch {
          /* ignore */
        }
        if (me) set({ sync: { state: 'offline', pending: 0, message: 'Server unreachable' } });
      }
      if (!me) {
        set({ authed: false, booted: true });
        return;
      }
      await get().signedIn(me);
    },

    async signedIn(me) {
      try {
        localStorage.setItem('panelist.me', JSON.stringify(me));
      } catch {
        /* ignore */
      }
      set({ authed: true, me });
      try {
        // A different account on this device: its predecessor's data must not linger.
        const previous = await getSetting<string>('auth.email', '');
        if (previous && previous !== me.email) await clearLocalData();
        await setSetting('auth.email', me.email);
      } catch {
        /* storage unavailable; handled below */
      }
      try {
        const defs = await getSetting<CustomFrameworkDef[]>('customFrameworks', []);
        setCustomFrameworks(defs);
        const prefs = await getSetting<FrameworkPrefs>('frameworkPrefs', EMPTY_PREFS);
        const phrases = await getSetting<{ phrases?: UserPhrase[] } | null>('userPhrases', null);
        set((s) => ({ customFrameworks: defs, frameworkPrefs: { ...EMPTY_PREFS, ...prefs }, userPhrases: phrases?.phrases ?? [], frameworksVersion: s.frameworksVersion + 1 }));
        await loadReviewList(set);
        set({ booted: true });
      } catch (e) {
        console.error(e);
        set({ booted: true });
        get().notify('Browser storage is unavailable; your work will not persist.', 'error');
      }
      void ensureEngine().start();
    },

    async signOut(everywhere = false) {
      try {
        if (everywhere) await api.logoutEverywhere();
        else await api.logout();
      } catch {
        /* the cookie may already be gone */
      }
      engine?.stop();
      engine = null;
      try {
        localStorage.removeItem('panelist.me');
        localStorage.removeItem('panelist.authed');
      } catch {
        /* ignore */
      }
      // Nothing confidential stays on a signed-out device; sync restores it after sign-in.
      await clearLocalData();
      for (const d of Object.values(get().docs)) destroyPdf(d.pdf);
      set({ authed: false, me: null, adminOpen: false, passwordDialogOpen: false, review: null, docs: {}, activeDocId: null, reviews: [], selectedNoteId: null, editingNoteId: null, focusMode: false });
    },

    async syncNow() {
      await ensureEngine().sync();
    },

    async createReview(files, opts = {}) {
      set({ busy: 'Opening your PDF…' });
      const review = newReview({ frameworkId: opts.frameworkId ?? 'generic' });
      const first = files[0];
      review.title = first.name.replace(/\.pdf$/i, '');
      const initialTitle = review.title;
      const initialFramework = review.frameworkId;
      for (const [i, file] of files.entries()) {
        const id = nanoid(10);
        review.docs.push({ id, name: file.name, size: file.size, pages: 0, addedAt: Date.now(), role: i === 0 ? 'application' : 'supporting' });
        await db.files.put({ id, reviewId: review.id, name: file.name, blob: file });
      }
      await db.reviews.put(review);
      set((s) => ({ reviews: [review, ...s.reviews], review, activeDocId: review.docs[0].id, page: 1, tab: 'brief', docs: {}, selectedNoteId: null, editingNoteId: null }));
      void ensureEngine().recordChanges(null, review);
      // Upload the PDFs so other devices can open this review; extraction proceeds meanwhile.
      // Progress shows in the workspace strip, never in the modal overlay.
      const uploads = review.docs.map((doc, i) =>
        uploadDoc(review.id, doc, files[i]).catch((e) => {
          console.error(e);
          get().notify(`${doc.name} could not be uploaded yet; it will stay on this device until it can.`, 'error');
        }),
      );
      // The workspace opens as soon as the first PDF parses; text extraction (facts,
      // outline, framework detection) continues in the background with its own progress.
      let markOpened!: () => void;
      const opened = new Promise<void>((resolve) => (markOpened = resolve));
      void (async () => {
        for (const [i, doc] of review.docs.entries()) {
          const res = await loadRuntimeDoc(review.id, doc.id, files[i], (pdf) => {
            get().update((r) => {
              const d = r.docs.find((x) => x.id === doc.id);
              if (d) d.pages = pdf.numPages;
            });
            if (i === 0) markOpened();
          });
          if (i === 0) markOpened(); // also on failure, so the viewer can show the error
          if (get().review?.id !== review.id) continue;
          if (i === 0 && res) {
            // Extraction finishes after the reviewer may already be working: fill in only
            // what they have not set themselves.
            get().update((r) => {
              const kept = Object.fromEntries(Object.entries(r.facts).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));
              r.facts = { ...res.facts, ...kept };
              if (r.title === initialTitle && res.facts.title && res.facts.title.length <= 160) r.title = res.facts.title;
              if (!opts.frameworkId && r.frameworkId === initialFramework) {
                const detected = detectFramework(res.pages.map((p) => p.text).join('\n'));
                if (detected) r.frameworkId = detected;
              }
            });
          }
        }
      })();
      await opened;
      set({ busy: null });
      void Promise.all(uploads).then(() => {
        if (get().review?.id === review.id) for (const d of review.docs) void get().ensureReflow(d.id);
      });
      return review.id;
    },

    async openReview(id) {
      const review = await db.reviews.get(id);
      if (!review) {
        get().notify('That review no longer exists.', 'error');
        return;
      }
      const activeDocId = review.docs[0]?.id ?? null;
      for (const k of [...announced]) if (k.startsWith(`${review.id}|`)) announced.delete(k);
      set({ review, activeDocId, docs: {}, reflow: {}, figureViewer: null, page: activeDocId ? review.lastPage[activeDocId] ?? 1 : 1, tab: 'brief', selectedNoteId: null, editingNoteId: null, searchQuery: '' });
      for (const doc of review.docs) void get().ensureReflow(doc.id);
      for (const doc of review.docs) {
        await loadDocFromAnywhere(review.id, doc);
        const runtime = get().docs[doc.id];
        if (runtime?.status === 'ready' && doc.role === 'application' && Object.keys(get().review?.facts ?? {}).length === 0) {
          get().update((r) => {
            r.facts = runtime.facts;
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
      set({ review: null, docs: {}, reflow: {}, figureViewer: null, activeDocId: null, selectedNoteId: null, editingNoteId: null, focusMode: false, saveState: 'idle', sheet: null });
      void loadReviewList(set);
    },

    async deleteReview(id) {
      await db.files.where('reviewId').equals(id).delete();
      await db.reviews.delete(id);
      await db.syncstate.where('reviewId').equals(id).delete();
      set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }));
      void ensureEngine().recordReviewDeleted(id);
      api.deleteReview(id).catch(() => undefined);
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
      void uploadDoc(r.id, { id, name: file.name, size: file.size, pages: 0, addedAt: Date.now(), role }, file)
        .then(() => {
          if (get().review?.id === r.id) void get().ensureReflow(id);
        })
        .catch((e) => {
          console.error(e);
          get().notify(`${file.name} could not be uploaded yet.`, 'error');
        });
      await loadRuntimeDoc(r.id, id, file);
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
        void ensureEngine().recordChanges(r, next);
      }
    },

    addAnnotation(a) {
      const id = nanoid(8);
      const now = Date.now();
      get().update((r) => {
        r.annotations.push({ ...a, comment: a.comment ?? '', id, createdAt: now, updatedAt: now });
      });
      set({ selectedNoteId: id, editingNoteId: id, tab: 'notes', sheet: 'panel' });
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
    setSheet: (sheet) => set({ sheet }),

    announceResume(docId, page, section) {
      const r = get().review;
      if (!r || page <= 1) return;
      const key = `${r.id}|${docId}`;
      if (announced.has(key)) return;
      announced.add(key);
      get().notify(`Resumed at p. ${page}${section ? ` · ${section}` : ''}`, 'info');
    },
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

    setViewMode(viewMode) {
      try {
        localStorage.setItem('panelist.view', viewMode);
      } catch {
        /* ignore */
      }
      set({ viewMode });
      const s = get();
      if (viewMode === 'read' && s.activeDocId && s.review) void s.ensureReflow(s.activeDocId);
    },

    async ensureReflow(docId) {
      const review = get().review;
      if (!review) return;
      const reviewId = review.id;
      const current = get().reflow[docId];
      if (current?.status === 'ready' && current.doc) return;
      if (current?.status === 'processing') return; // already polling
      const setState = (patch: Partial<ReflowState>) => set((s) => ({ reflow: { ...s.reflow, [docId]: { ...(s.reflow[docId] ?? { status: 'none' }), ...patch } } }));
      try {
        let status = await api.reflowStatus(reviewId, docId);
        if (status.status === 'none' || status.status === 'error') {
          // The PDF may still be uploading from this device; try to start, tolerate 404.
          try {
            status = await api.startReflow(reviewId, docId);
          } catch {
            const cur = get().reflow[docId];
            if (!cur?.message?.startsWith('Uploading')) setState({ status: 'none', message: 'Waiting for the PDF to reach your server…' });
            setTimeout(() => {
              if (get().review?.id === reviewId) void get().ensureReflow(docId);
            }, 4000);
            return;
          }
        }
        while (status.status === 'processing') {
          setState({ status: 'processing', done: status.done, total: status.total, message: status.message });
          await new Promise((r) => setTimeout(r, 1200));
          if (get().review?.id !== reviewId) return;
          status = await api.reflowStatus(reviewId, docId);
        }
        if (status.status === 'ready') {
          const doc = await api.reflowDoc(reviewId, docId);
          setState({ status: 'ready', doc, message: undefined });
        } else if (status.status === 'error') {
          setState({ status: 'error', message: status.error });
        } else setState({ status: 'none' });
      } catch (e) {
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    },

    openFigure: (docId, figureId) => set({ figureViewer: figureId ? { docId, figureId } : null }),

    setFitMode(fitMode) {
      try {
        localStorage.setItem('panelist.fit', fitMode);
      } catch {
        /* ignore */
      }
      set({ fitMode, zoom: 1 });
    },

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
      const me = deviceId();
      get().update((rv) => {
        const by = { ...(rv.activeByDevice ?? {}) };
        // Migrate a pre-sync total onto this device once.
        if (!rv.activeByDevice && rv.activeMs) by[me] = rv.activeMs;
        by[me] = (by[me] ?? 0) + ms;
        rv.activeByDevice = by;
        rv.activeMs = Object.values(by).reduce((a, b) => a + b, 0);
      });
    },

    async importReview(review, files) {
      for (const f of files) await db.files.put({ id: f.id, reviewId: review.id, name: f.name, blob: f.blob });
      await db.reviews.put(review);
      set((s) => ({ reviews: [review, ...s.reviews.filter((r) => r.id !== review.id)] }));
      void ensureEngine().recordChanges(null, review);
      for (const f of files) api.uploadFile(review.id, f.id, f.blob).catch(() => undefined);
    },

    async saveCustomFramework(def) {
      const next = [...get().customFrameworks.filter((d) => d.id !== def.id), { ...def, updatedAt: Date.now() }].sort((a, b) => a.name.localeCompare(b.name));
      setCustomFrameworks(next);
      set((s) => ({ customFrameworks: next, frameworksVersion: s.frameworksVersion + 1 }));
      await setSetting('customFrameworks', next);
      void ensureEngine().recordAccount(`framework:${def.id}`, next.find((d) => d.id === def.id));
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
      void ensureEngine().recordAccount(`framework:${id}`, null, true);
      return true;
    },

    setMe: (me) => {
      try {
        localStorage.setItem('panelist.me', JSON.stringify(me));
      } catch {
        /* ignore */
      }
      set({ me });
    },
    openAdmin: () => set({ adminOpen: true, paletteOpen: false, helpOpen: false }),
    closeAdmin: () => set({ adminOpen: false }),
    openPasswordDialog: () => set({ passwordDialogOpen: true, paletteOpen: false, helpOpen: false }),
    closePasswordDialog: () => set({ passwordDialogOpen: false }),
    async setFrameworkPrefs(patch) {
      const next: FrameworkPrefs = { ...get().frameworkPrefs, ...patch };
      set({ frameworkPrefs: next });
      // Persist locally and queue the sync together, so neither waits on the other.
      await Promise.all([setSetting('frameworkPrefs', next), ensureEngine().recordAccount(PREFS_KEY, next)]);
    },
    async saveUserPhrase(text, use) {
      const clean = text.trim().replace(/\s+/g, ' ');
      if (!clean) return;
      const next = [{ id: nanoid(8), text: clean, use, createdAt: Date.now() }, ...get().userPhrases.filter((p) => p.text !== clean)];
      set({ userPhrases: next });
      await Promise.all([setSetting('userPhrases', { phrases: next }), ensureEngine().recordAccount(PHRASES_KEY, { phrases: next })]);
    },
    async deleteUserPhrase(id) {
      const next = get().userPhrases.filter((p) => p.id !== id);
      set({ userPhrases: next });
      await Promise.all([setSetting('userPhrases', { phrases: next }), ensureEngine().recordAccount(PHRASES_KEY, { phrases: next })]);
    },
    openSecurity: () => set({ securityOpen: true, paletteOpen: false, helpOpen: false }),
    closeSecurity: () => set({ securityOpen: false }),
    openInbox: () => set({ inboxOpen: true, paletteOpen: false, helpOpen: false }),
    closeInbox: () => set({ inboxOpen: false }),
    async openWhenSynced(id) {
      for (let i = 0; i < 40; i++) {
        if (await db.reviews.get(id)) {
          await loadReviewList(set);
          await get().openReview(id);
          return;
        }
        if (i === 0) get().notify('Fetching the review you sent…', 'info');
        await ensureEngine().sync();
        await new Promise((r) => setTimeout(r, 1500));
      }
      get().notify('That review has not reached this device yet. Pull to sync and try again.', 'error');
    },
    openMeeting: () => set({ meetingOpen: true, paletteOpen: false, helpOpen: false }),
    closeMeeting: () => set({ meetingOpen: false }),
    updatePanel(patch) {
      get().update((r) => {
        r.panel = { ...(r.panel ?? EMPTY_PANEL), ...patch };
      });
    },
    logDiscussion(who, text) {
      const clean = text.trim();
      if (!clean) return;
      get().update((r) => {
        const p = r.panel ?? EMPTY_PANEL;
        r.panel = { ...p, log: [...p.log, { id: nanoid(8), at: Date.now(), who: who.trim() || 'Panel', text: clean }] };
      });
    },
    reviseScore(score, reason) {
      const fw = getFramework(get().review?.frameworkId ?? 'generic');
      const label = scoreLabel(fw.overall.scale, score) || 'unchanged';
      get().update((r) => {
        const p = r.panel ?? EMPTY_PANEL;
        const entry = { id: nanoid(8), at: Date.now(), who: 'Me', text: `Score after discussion: ${label}${reason.trim() ? ` — ${reason.trim()}` : ''}` };
        r.panel = { ...p, finalScore: score, finalReason: reason.trim() || undefined, log: [...p.log, entry] };
      });
    },
    openFrameworkEditor: (id) => set({ frameworkEditor: { open: true, id }, paletteOpen: false, helpOpen: false }),
    closeFrameworkEditor: () => set({ frameworkEditor: { open: false } }),
  };
});

/** Convenience selectors. */
export const selectActiveDoc = (s: State): RuntimeDoc | undefined => (s.activeDocId ? s.docs[s.activeDocId] : undefined);
export const selectActiveMeta = (s: State): DocMeta | undefined => s.review?.docs.find((d) => d.id === s.activeDocId);

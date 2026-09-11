import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { FileUp, Sparkles, Trash2, Upload, Lock, Highlighter, ListChecks, FileOutput, LogOut, Cloud, CloudOff, RefreshCw, Plus, ChevronDown, KeyRound, Users, UserRound, Send, Fingerprint, Archive, ArchiveRestore, CalendarClock, X } from 'lucide-react';
import { useIsPhone } from '../hooks/useMedia';
import { useStore } from '../lib/store';
import { getFramework } from '../lib/frameworks';
import { FrameworkOptions } from './FrameworkOptions';
import { computeProgress } from '../lib/progress';
import { dueLabel, formatRelative, plural } from '../lib/format';
import type { Review } from '../lib/types';
import { parseBackup } from '../lib/export/backup';
import { ProgressRing, Wordmark } from './ui';

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-application.pdf`;

export function Library() {
  const allReviews = useStore((s) => s.reviews);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<'recent' | 'due'>(() => {
    try {
      return localStorage.getItem('panelist.librarySort') === 'due' ? 'due' : 'recent';
    } catch {
      return 'recent';
    }
  });
  const changeSort = (v: 'recent' | 'due') => {
    setSort(v);
    try {
      localStorage.setItem('panelist.librarySort', v);
    } catch {
      /* ignore */
    }
  };
  const byDue = (a: Review, b: Review) => (a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : a.dueDate ? -1 : b.dueDate ? 1 : b.updatedAt - a.updatedAt);
  const reviews = allReviews.filter((r) => !r.archivedAt).sort(sort === 'due' ? byDue : (a, b) => b.updatedAt - a.updatedAt);
  const archived = allReviews.filter((r) => r.archivedAt).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  const [dueEditId, setDueEditId] = useState<string | null>(null);
  const createReview = useStore((s) => s.createReview);
  const openReview = useStore((s) => s.openReview);
  const deleteReview = useStore((s) => s.deleteReview);
  const importReview = useStore((s) => s.importReview);
  const notify = useStore((s) => s.notify);
  const sync = useStore((s) => s.sync);
  const isPhone = useIsPhone();
  const defaultFrameworkId = useStore((s) => s.frameworkPrefs.defaultId);
  const [frameworkId, setFrameworkId] = useState<string>(defaultFrameworkId ?? 'auto');
  // The reviewer's default applies to new reviews; it can change while the library is open.
  useEffect(() => {
    setFrameworkId(defaultFrameworkId ?? 'auto');
  }, [defaultFrameworkId]);
  const [dragging, setDragging] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const start = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
      if (!pdfs.length) {
        notify('Please choose a PDF file.', 'error');
        return;
      }
      await createReview(pdfs, frameworkId === 'auto' ? {} : { frameworkId });
    },
    [createReview, frameworkId, notify],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    start([...e.dataTransfer.files]);
  };

  const trySample = async () => {
    try {
      useStore.setState({ busy: 'Fetching the sample application…' });
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error('sample missing');
      const blob = await res.blob();
      const file = new File([blob], 'Sample R01 application (fictional).pdf', { type: 'application/pdf' });
      await createReview([file], {});
    } catch {
      useStore.setState({ busy: null });
      notify('The sample application could not be loaded.', 'error');
    }
  };

  const onBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { review, files } = parseBackup(await file.text());
      await importReview(review, files);
      notify(`Imported “${review.title}”.`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Import failed.', 'error');
    }
  };

  return (
    <div className="library" onDragOver={(e) => e.preventDefault()}>
      <header className="library-top">
        <Wordmark size="m" />
        <span className="library-tag">
          <span className="library-tagline">
            <Lock size={12} /> Private to you, synced across your devices
          </span>
          <span className={`sync-state sync-${sync.state}`} title={sync.message ?? (sync.pending ? `${sync.pending} pending` : 'Synced')}>
            {sync.state === 'syncing' ? <RefreshCw size={13} className="spin" /> : sync.state === 'offline' || sync.state === 'error' ? <CloudOff size={13} /> : <Cloud size={13} />}
            <span>{sync.state === 'syncing' ? 'Syncing' : sync.state === 'offline' ? 'Offline' : sync.state === 'error' ? 'Sync error' : sync.pending ? `${sync.pending} pending` : 'Synced'}</span>
          </span>
          <AccountMenu />
        </span>
      </header>

      <main className="library-main">
        {!(isPhone && reviews.length > 0) && (
          <section className="hero">
            <h1>Read closely. Decide clearly.</h1>
            <p>
              Panelist is a workbench for grant reviewers. Drop in the application PDF, tag the strengths and weaknesses as you read, score each criterion the way your agency expects, and walk
              away with a critique that is already written.
            </p>
          </section>
        )}

        <section
          className={`dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={isPhone ? undefined : () => fileInput.current?.click()}
          role={isPhone ? undefined : 'button'}
          tabIndex={isPhone ? undefined : 0}
          onKeyDown={isPhone ? undefined : (e) => e.key === 'Enter' && fileInput.current?.click()}
        >
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => start([...(e.target.files ?? [])])} />
          {isPhone ? (
            <div className="dropzone-phone">
              <div className="dropzone-icon">
                <FileUp size={22} strokeWidth={1.6} />
              </div>
              <div>
                <div className="dropzone-title">New review</div>
                <div className="dropzone-sub">Choose a PDF from Files, or open a review from another device below.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="dropzone-icon">
                <FileUp size={26} strokeWidth={1.6} />
              </div>
              <div className="dropzone-title">Drop the application PDF here</div>
              <div className="dropzone-sub">or click to browse. Add supporting documents at the same time if you have them.</div>
            </>
          )}
          {isPhone && (
            <button type="button" className="btn btn-primary dropzone-add" onClick={(e) => (e.stopPropagation(), fileInput.current?.click())}>
              <Plus size={15} /> Add a proposal PDF
            </button>
          )}
          <div className="dropzone-row" onClick={(e) => e.stopPropagation()}>
            <label className="field-inline">
              <span>Framework</span>
              <select
                value={frameworkId}
                onChange={(e) => {
                  if (e.target.value === '__manage') useStore.getState().openFrameworkEditor();
                  else setFrameworkId(e.target.value);
                }}
              >
                <option value="auto">Detect from the PDF</option>
                <FrameworkOptions keepId={frameworkId} />
                <option value="__manage">Manage frameworks…</option>
              </select>
            </label>
            <button type="button" className="btn btn-ghost" onClick={trySample}>
              <Sparkles size={14} /> Try a sample application
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => backupInput.current?.click()}>
              <Upload size={14} /> Import a backup
            </button>
            <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={(e) => onBackup(e.target.files?.[0])} />
          </div>
        </section>

        {(reviews.length > 0 || archived.length > 0) && (
          <section className="review-list">
            <div className="review-list-head">
              <h2>Your reviews</h2>
              {reviews.length > 1 && (
                <label className="field-inline review-sort">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => changeSort(e.target.value as 'recent' | 'due')} aria-label="Sort reviews">
                    <option value="recent">Recently updated</option>
                    <option value="due">Due date</option>
                  </select>
                </label>
              )}
            </div>
            {reviews.length === 0 && <p className="muted">Nothing active. {archived.length > 0 ? 'Your archived reviews are below.' : ''}</p>}
            <ul>
              {reviews.map((r) => {
                const fw = getFramework(r.frameworkId);
                const progress = computeProgress(r, fw);
                const due = r.dueDate ? dueLabel(r.dueDate) : null;
                return (
                  <li key={r.id} className="review-card">
                    <button type="button" className="review-card-main" onClick={() => openReview(r.id)}>
                      <ProgressRing value={progress.percent} size={40} stroke={4} label={`${progress.percent}`} />
                      <div className="review-card-text">
                        <div className="review-card-title">{r.title.trim() || 'Untitled review'}</div>
                        <div className="review-card-meta">
                          <span className="badge">{fw.agency}</span>
                          {due && <span className={`due due-${due.level}`}>{due.text}</span>}
                          <span>{plural(r.annotations.length, 'note')}</span>
                          <span>{plural(r.docs.reduce((a, d) => a + d.pages, 0), 'page')}</span>
                          <span>Updated {formatRelative(r.updatedAt)}</span>
                        </div>
                      </div>
                    </button>
                    {dueEditId === r.id ? (
                      <span className="due-edit">
                        <input
                          type="date"
                          value={r.dueDate ?? ''}
                          aria-label="Due date"
                          autoFocus
                          onChange={(e) => void useStore.getState().setReviewFields(r.id, { dueDate: e.target.value || null })}
                        />
                        {r.dueDate && (
                          <button type="button" className="btn btn-ghost btn-s" onClick={() => (void useStore.getState().setReviewFields(r.id, { dueDate: null }), setDueEditId(null))}>
                            Clear
                          </button>
                        )}
                        <button type="button" className="icon-btn" aria-label="Done" onClick={() => setDueEditId(null)}>
                          <X size={14} />
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="icon-btn" aria-label={r.dueDate ? 'Change due date' : 'Set due date'} title={r.dueDate ? 'Change the due date' : 'Set a due date'} onClick={() => setDueEditId(r.id)}>
                        <CalendarClock size={15} />
                      </button>
                    )}
                    <button type="button" className="icon-btn" aria-label="Archive review" title="Archive: out of the way, not deleted" onClick={() => void useStore.getState().setReviewFields(r.id, { archivedAt: Date.now() })}>
                      <Archive size={15} />
                    </button>
                    {confirmId === r.id ? (
                      <div className="review-card-confirm">
                        <span>Delete this review and its PDFs?</span>
                        <button type="button" className="btn btn-danger btn-s" onClick={() => deleteReview(r.id)}>
                          Delete
                        </button>
                        <button type="button" className="btn btn-ghost btn-s" onClick={() => setConfirmId(null)}>
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="icon-btn" aria-label="Delete review" title="Delete review" onClick={() => setConfirmId(r.id)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {archived.length > 0 && (
              <div className="archived">
                <button type="button" className="link archived-toggle" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
                  <Archive size={13} /> Archived ({archived.length})
                  <ChevronDown size={14} className={`chev ${showArchived ? 'is-open' : ''}`} />
                </button>
                {showArchived && (
                  <ul>
                    {archived.map((r) => (
                      <li key={r.id} className="review-card is-archived">
                        <button type="button" className="review-card-main" onClick={() => openReview(r.id)}>
                          <div className="review-card-text">
                            <div className="review-card-title">{r.title.trim() || 'Untitled review'}</div>
                            <div className="review-card-meta">
                              <span className="badge">{getFramework(r.frameworkId).agency}</span>
                              <span>Archived {formatRelative(r.archivedAt ?? 0)}</span>
                            </div>
                          </div>
                        </button>
                        <button type="button" className="icon-btn" aria-label="Unarchive review" title="Bring it back to your reviews" onClick={() => void useStore.getState().setReviewFields(r.id, { archivedAt: null })}>
                          <ArchiveRestore size={15} />
                        </button>
                        {confirmId === r.id ? (
                          <div className="review-card-confirm">
                            <span>Delete this review and its PDFs?</span>
                            <button type="button" className="btn btn-danger btn-s" onClick={() => deleteReview(r.id)}>
                              Delete
                            </button>
                            <button type="button" className="btn btn-ghost btn-s" onClick={() => setConfirmId(null)}>
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="icon-btn" aria-label="Delete review" title="Delete review" onClick={() => setConfirmId(r.id)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <section className="features">
          <div className="feature">
            <Highlighter size={18} strokeWidth={1.7} />
            <h3>Evidence first</h3>
            <p>Select any passage and press S, W, Q, or N. Every highlight becomes a bullet with a page reference.</p>
          </div>
          <div className="feature">
            <ListChecks size={18} strokeWidth={1.7} />
            <h3>Agency rubrics built in</h3>
            <p>NIH, NSF, CIHR, and ERC criteria with their scales, guiding questions, and completeness checks.</p>
          </div>
          <div className="feature">
            <FileOutput size={18} strokeWidth={1.7} />
            <h3>The critique writes itself</h3>
            <p>Scores, rationale, and tagged evidence assemble into a structured review you can export as Word or Markdown.</p>
          </div>
        </section>
      </main>
      <footer className="library-foot">Applications are confidential. Panelist keeps them on your own password-protected server and syncs to every device you sign in on.</footer>
    </div>
  );
}

/** Who is signed in, with the account actions: password, people (admins), sign out. */
function AccountMenu() {
  const me = useStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="account-wrap">
      <button type="button" className="btn btn-ghost btn-s account-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account: ${me?.email ?? ''}`} title={me?.email}>
        <UserRound size={14} />
        <span className="account-email">{me?.email ?? 'Account'}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div className="more-scrim" onClick={() => setOpen(false)} />
          <div className="popover more-pop account-pop" role="menu">
            <div className="account-who">
              {me?.email}
              {me?.isAdmin && <span className="chip chip-quiet">admin</span>}
            </div>
            <button type="button" className="more-item" role="menuitem" onClick={act(() => useStore.getState().openInbox())}>
              <Send size={14} /> Send PDFs from your phone
            </button>
            <button type="button" className="more-item" role="menuitem" onClick={act(() => useStore.getState().openSecurity())}>
              <Fingerprint size={14} /> Passkeys and devices
            </button>
            <button type="button" className="more-item" role="menuitem" onClick={act(() => useStore.getState().openPasswordDialog())}>
              <KeyRound size={14} /> Change password
            </button>
            {me?.isAdmin && (
              <button type="button" className="more-item" role="menuitem" onClick={act(() => useStore.getState().openAdmin())}>
                <Users size={14} /> Manage people
              </button>
            )}
            <button type="button" className="more-item" role="menuitem" onClick={act(() => useStore.getState().signOut())}>
              <LogOut size={14} /> Sign out of this device
            </button>
            <button type="button" className="more-item is-danger" role="menuitem" onClick={act(() => useStore.getState().signOut(true))} title="Ends the session on every device, including this one">
              <LogOut size={14} /> Sign out everywhere
            </button>
          </div>
        </>
      )}
    </div>
  );
}

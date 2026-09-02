import { useCallback, useRef, useState, type DragEvent } from 'react';
import { FileUp, Sparkles, Trash2, Upload, Lock, Highlighter, ListChecks, FileOutput } from 'lucide-react';
import { useStore } from '../lib/store';
import { FRAMEWORKS, getFramework } from '../lib/frameworks';
import { computeProgress } from '../lib/progress';
import { formatRelative, plural } from '../lib/format';
import { parseBackup } from '../lib/export/backup';
import { ProgressRing, Wordmark } from './ui';

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-application.pdf`;

export function Library() {
  const reviews = useStore((s) => s.reviews);
  const createReview = useStore((s) => s.createReview);
  const openReview = useStore((s) => s.openReview);
  const deleteReview = useStore((s) => s.deleteReview);
  const importReview = useStore((s) => s.importReview);
  const notify = useStore((s) => s.notify);
  const [frameworkId, setFrameworkId] = useState<string>('auto');
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
          <Lock size={12} /> Private by design: nothing leaves this browser
        </span>
      </header>

      <main className="library-main">
        <section className="hero">
          <h1>Read closely. Decide clearly.</h1>
          <p>
            Panelist is a workbench for grant reviewers. Drop in the application PDF, tag the strengths and weaknesses as you read, score each criterion the way your agency expects, and walk away
            with a critique that is already written.
          </p>
        </section>

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
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
        >
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => start([...(e.target.files ?? [])])} />
          <div className="dropzone-icon">
            <FileUp size={26} strokeWidth={1.6} />
          </div>
          <div className="dropzone-title">Drop the application PDF here</div>
          <div className="dropzone-sub">or click to browse. Add supporting documents at the same time if you have them.</div>
          <div className="dropzone-row" onClick={(e) => e.stopPropagation()}>
            <label className="field-inline">
              <span>Framework</span>
              <select value={frameworkId} onChange={(e) => setFrameworkId(e.target.value)}>
                <option value="auto">Detect from the PDF</option>
                {FRAMEWORKS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
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

        {reviews.length > 0 && (
          <section className="review-list">
            <h2>Your reviews</h2>
            <ul>
              {reviews.map((r) => {
                const fw = getFramework(r.frameworkId);
                const progress = computeProgress(r, fw);
                return (
                  <li key={r.id} className="review-card">
                    <button type="button" className="review-card-main" onClick={() => openReview(r.id)}>
                      <ProgressRing value={progress.percent} size={40} stroke={4} label={`${progress.percent}`} />
                      <div className="review-card-text">
                        <div className="review-card-title">{r.title}</div>
                        <div className="review-card-meta">
                          <span className="badge">{fw.agency}</span>
                          <span>{plural(r.annotations.length, 'note')}</span>
                          <span>{plural(r.docs.reduce((a, d) => a + d.pages, 0), 'page')}</span>
                          <span>Updated {formatRelative(r.updatedAt)}</span>
                        </div>
                      </div>
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
      <footer className="library-foot">Applications are confidential. Panelist stores everything in this browser only and never contacts a server.</footer>
    </div>
  );
}

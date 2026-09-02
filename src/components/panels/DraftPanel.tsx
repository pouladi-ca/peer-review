import { useMemo, useState } from 'react';
import { Copy, Download, FileText, Printer, Archive, Wand2, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../lib/store';
import { getFramework } from '../../lib/frameworks';
import { autoSummary, composeDraft, draftToMarkdown, draftToPlainText, type DraftBullet } from '../../lib/draft';
import { copyText, downloadBlob, downloadText, safeFilename } from '../../lib/export/download';
import { draftToDocx } from '../../lib/export/docx';
import { createBackup } from '../../lib/export/backup';
import { AutoTextarea } from '../ui';

export function DraftPanel() {
  const review = useStore((s) => s.review)!;
  const update = useStore((s) => s.update);
  const notify = useStore((s) => s.notify);
  const fw = getFramework(review.frameworkId);
  const [includeConfidential, setIncludeConfidential] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const draft = useMemo(() => composeDraft(review, fw), [review, fw]);
  const base = safeFilename(review.title);

  const doCopy = async (plain: boolean) => {
    const ok = await copyText(plain ? draftToPlainText(draft, { includeConfidential }) : draftToMarkdown(draft, { includeConfidential }));
    notify(ok ? `Copied the draft as ${plain ? 'plain text' : 'Markdown'}.` : 'Copy failed.', ok ? 'success' : 'error');
  };
  const doDocx = async () => {
    try {
      downloadBlob(await draftToDocx(draft, { includeConfidential }), `${base}-review.docx`);
      notify('Word document downloaded.', 'success');
    } catch (e) {
      console.error(e);
      notify('Could not build the Word document.', 'error');
    }
  };
  const doBackup = async () => {
    const b = await createBackup(review, true);
    downloadText(JSON.stringify(b), `${base}.panelist.json`, 'application/json');
    notify('Backup downloaded. It contains the PDFs, so keep it confidential.', 'success');
  };
  const doPrint = () => {
    document.body.setAttribute('data-print', includeConfidential ? 'all' : 'shared');
    window.print();
    setTimeout(() => document.body.removeAttribute('data-print'), 1000);
  };

  return (
    <div className="draft">
      <section className="card">
        <div className="card-title">
          Summary of the application
          <button
            type="button"
            className="link"
            onClick={() =>
              update((r) => {
                r.draft.summary = autoSummary(r);
              })
            }
            title="Prefill from the detected title and aims"
          >
            <Wand2 size={12} /> Prefill
          </button>
        </div>
        <AutoTextarea
          minRows={4}
          value={review.draft.summary}
          placeholder={autoSummary(review)}
          onChange={(e) =>
            update((r) => {
              r.draft.summary = e.target.value;
            })
          }
          aria-label="Summary of the application"
        />
      </section>

      <section className="card">
        <div className="card-title">Additional comments</div>
        <AutoTextarea
          minRows={2}
          value={review.draft.additional}
          placeholder="Anything that does not belong under a criterion: presentation, scope, resubmission advice."
          onChange={(e) =>
            update((r) => {
              r.draft.additional = e.target.value;
            })
          }
          aria-label="Additional comments"
        />
      </section>

      <section className="card">
        <div className="card-title">
          Confidential comments to the program
          <label className="switch">
            <input type="checkbox" checked={includeConfidential} onChange={(e) => setIncludeConfidential(e.target.checked)} />
            <span>Include in export</span>
          </label>
        </div>
        <AutoTextarea
          minRows={2}
          value={review.draft.confidential}
          placeholder="Not shared with the applicants. Conflicts, concerns about integrity, or budget advice for staff."
          onChange={(e) =>
            update((r) => {
              r.draft.confidential = e.target.value;
            })
          }
          aria-label="Confidential comments"
        />
      </section>

      <section className="card export">
        <div className="card-title">Export</div>
        <div className="draft-stats">
          <span className="chip chip-strength">{draft.stats.strengths} strengths</span>
          <span className="chip chip-weakness">
            {draft.stats.weaknesses} weaknesses{draft.stats.major ? `, ${draft.stats.major} major` : ''}
          </span>
          <span className="chip chip-question">{draft.stats.questions} questions</span>
        </div>
        <div className="export-grid">
          <button type="button" className="btn" onClick={doDocx}>
            <FileText size={14} /> Word (.docx)
          </button>
          <button type="button" className="btn" onClick={() => downloadText(draftToMarkdown(draft, { includeConfidential }), `${base}-review.md`, 'text/markdown')}>
            <Download size={14} /> Markdown
          </button>
          <button type="button" className="btn" onClick={() => doCopy(false)}>
            <Copy size={14} /> Copy Markdown
          </button>
          <button type="button" className="btn" onClick={() => doCopy(true)}>
            <Copy size={14} /> Copy plain text
          </button>
          <button type="button" className="btn" onClick={doPrint}>
            <Printer size={14} /> Print or PDF
          </button>
          <button type="button" className="btn" onClick={doBackup} title="A JSON file with the review and its PDFs, for another browser or machine">
            <Archive size={14} /> Backup
          </button>
        </div>
      </section>

      <section className="card preview-card">
        <div className="card-title">
          Preview
          <button type="button" className="link" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />} {showPreview ? 'Hide' : 'Show'}
          </button>
        </div>
        {showPreview && <DraftPreview includeConfidential={includeConfidential} />}
      </section>
    </div>
  );
}

function Bullets({ title, list }: { title: string; list: DraftBullet[] }) {
  if (!list.length) return null;
  return (
    <>
      <div className="pv-sub">{title}</div>
      <ul>
        {list.map((b) => (
          <li key={b.noteId} className={b.severity === 'major' ? 'is-major' : ''}>
            {b.text}
          </li>
        ))}
      </ul>
    </>
  );
}

export function DraftPreview({ includeConfidential }: { includeConfidential: boolean }) {
  const review = useStore((s) => s.review)!;
  const fw = getFramework(review.frameworkId);
  const d = useMemo(() => composeDraft(review, fw), [review, fw]);
  return (
    <article className="preview" id="print-root">
      <h1>Review: {d.title}</h1>
      <p className="pv-meta">
        {d.frameworkName}. Drafted {new Date(d.generatedAt).toLocaleDateString()}.
      </p>
      <h2>Summary of the application</h2>
      <p>{d.summary}</p>
      {d.sections
        .filter((s) => !s.empty)
        .map((s) => (
          <section key={s.id}>
            <h2>{s.heading}</h2>
            {s.scoreLine && <p className="pv-score">{s.scoreLine}</p>}
            {s.body && <p className="pv-body">{s.body}</p>}
            <Bullets title="Strengths" list={s.strengths} />
            <Bullets title="Weaknesses" list={s.weaknesses} />
            <Bullets title="Questions for the applicants" list={s.questions} />
            <Bullets title="Other comments" list={s.notes} />
          </section>
        ))}
      {d.additional.length > 0 && (
        <section>
          <h2>Additional review criteria</h2>
          <ul>
            {d.additional.map((a) => (
              <li key={a.heading}>
                <strong>{a.heading}.</strong> {a.line}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2>{d.overall.heading}</h2>
        {d.overall.scoreLine && <p className="pv-score">{d.overall.scoreLine}</p>}
        {d.overall.recommendation && (
          <p className="pv-score">
            Recommendation: {d.overall.recommendation}
          </p>
        )}
        {d.overall.body ? <p className="pv-body">{d.overall.body}</p> : <p className="pv-missing">No overall rationale yet.</p>}
      </section>
      {d.additionalComments && (
        <section>
          <h2>Additional comments</h2>
          <p className="pv-body">{d.additionalComments}</p>
        </section>
      )}
      {includeConfidential && d.confidential && (
        <section className="pv-confidential">
          <h2>Confidential comments to the program</h2>
          <p className="pv-body">{d.confidential}</p>
        </section>
      )}
    </article>
  );
}

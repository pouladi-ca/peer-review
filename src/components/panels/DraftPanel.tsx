import { useMemo, useState } from 'react';
import { useFramework } from '../../hooks/useFramework';
import { Copy, Download, FileText, Printer, Archive, Wand2, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../lib/store';
import { autoSummary, composeDraft, draftToMarkdown, draftToPlainText, sectionPlainText, type DraftBullet } from '../../lib/draft';
import { fieldSpec } from '../../lib/frameworks';
import { copyText, downloadBlob, downloadText, safeFilename } from '../../lib/export/download';
import { draftToDocx } from '../../lib/export/docx';
import { createBackup } from '../../lib/export/backup';
import { AutoTextarea, CharCount } from '../ui';
import { SubmitCheck } from '../Scorecard';

export function DraftPanel() {
  const review = useStore((s) => s.review)!;
  const update = useStore((s) => s.update);
  const notify = useStore((s) => s.notify);
  const fw = useFramework(review.frameworkId);
  const [includeConfidential, setIncludeConfidential] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const draft = useMemo(() => composeDraft(review, fw), [review, fw]);
  const base = safeFilename(review.title);
  const summarySpec = fieldSpec(fw, 'summary');
  const additionalSpec = fieldSpec(fw, 'additional');

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
        <div className="card-title">Before you submit</div>
        <SubmitCheck />
      </section>

      <section className="card">
        <div className="card-title">
          {summarySpec.label}
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
        {summarySpec.hint && <p className="card-hint">{summarySpec.hint}</p>}
        <AutoTextarea
          minRows={4}
          value={review.draft.summary}
          placeholder={autoSummary(review)}
          onChange={(e) =>
            update((r) => {
              r.draft.summary = e.target.value;
            })
          }
          aria-label={summarySpec.label}
        />
        <CharCount value={review.draft.summary} max={summarySpec.maxChars} className="ta-count" />
      </section>

      <section className="card">
        <div className="card-title">{additionalSpec.label}</div>
        <AutoTextarea
          minRows={2}
          value={review.draft.additional}
          placeholder={additionalSpec.hint ?? 'Anything that does not belong under a criterion: presentation, scope, resubmission advice.'}
          onChange={(e) =>
            update((r) => {
              r.draft.additional = e.target.value;
            })
          }
          aria-label={additionalSpec.label}
        />
        <CharCount value={review.draft.additional} max={additionalSpec.maxChars} className="ta-count" />
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

/** A preview heading with the box's character count against the funder's limit and a copy button for pasting into the form. */
function BoxHead({ title, text, max }: { title: string; text: string; max?: number }) {
  const notify = useStore((s) => s.notify);
  const copy = async () => {
    const ok = await copyText(text);
    notify(ok ? `Copied “${title}”.` : 'Copy failed.', ok ? 'success' : 'error');
  };
  return (
    <div className="pv-head">
      <h2>{title}</h2>
      <span className="pv-tools">
        <CharCount value={text} max={max} />
        {text && (
          <button type="button" className="link" onClick={copy} title={`Copy this box as plain text`} aria-label={`Copy ${title}`}>
            <Copy size={12} /> Copy
          </button>
        )}
      </span>
    </div>
  );
}

export function DraftPreview({ includeConfidential }: { includeConfidential: boolean }) {
  const review = useStore((s) => s.review)!;
  const fw = useFramework(review.frameworkId);
  const d = useMemo(() => composeDraft(review, fw), [review, fw]);
  const overallText = [d.overall.scoreLine, d.overall.recommendation ? `${d.overall.recommendationLabel} ${d.overall.recommendation}` : ''].filter(Boolean).join('\n');
  return (
    <article className="preview" id="print-root">
      <h1>Review: {d.title}</h1>
      <p className="pv-meta">
        {d.frameworkName}. Drafted {new Date(d.generatedAt).toLocaleDateString()}.
      </p>
      <BoxHead title={d.labels.summary} text={d.summary} max={d.limits.summary} />
      <p>{d.summary}</p>
      {d.sections
        .filter((s) => !s.empty)
        .map((s) => (
          <section key={s.id}>
            <BoxHead title={s.heading} text={sectionPlainText(s)} max={s.maxChars} />
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
        <BoxHead title={d.overall.heading} text={overallText} />
        {d.overall.scoreLine && <p className="pv-score">{d.overall.scoreLine}</p>}
        {d.overall.recommendation && (
          <p className="pv-score">
            {d.overall.recommendationLabel} {d.overall.recommendation}
          </p>
        )}
        {fw.form?.overallComment && <BoxHead title={d.overall.bodyLabel} text={d.overall.body} max={d.limits.overallComment} />}
        {d.overall.body ? <p className="pv-body">{d.overall.body}</p> : <p className="pv-missing">No {d.overall.bodyLabel.toLowerCase()} yet.</p>}
      </section>
      {d.additionalComments && (
        <section>
          <BoxHead title={d.labels.additional} text={d.additionalComments} max={d.limits.additional} />
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

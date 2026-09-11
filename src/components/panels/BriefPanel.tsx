import { useMemo, useState } from 'react';
import { useFramework } from '../../hooks/useFramework';
import { ChevronDown, Compass, FlaskConical, Gauge, Sparkles, Target } from 'lucide-react';
import { claimsFromPages, claimsFromReflow } from '../../lib/analyze/claims';
import { rectsForQuote } from '../../lib/reflow/locate';
import { useStore, selectActiveDoc } from '../../lib/store';
import { computeProgress } from '../../lib/progress';
import { dueLabel, plural } from '../../lib/format';
import type { QuickFacts } from '../../lib/types';
import { ProgressRing } from '../ui';
import { Scorecard } from '../Scorecard';
import { readingLabel } from '../../lib/format';

const FIELDS: { key: keyof QuickFacts; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'pi', label: 'Applicant' },
  { key: 'institution', label: 'Institution' },
  { key: 'mechanism', label: 'Mechanism' },
  { key: 'budget', label: 'Budget' },
  { key: 'duration', label: 'Duration' },
];

export function BriefPanel() {
  const review = useStore((s) => s.review)!;
  const doc = useStore(selectActiveDoc);
  const update = useStore((s) => s.update);
  const fw = useFramework(review.frameworkId);
  const progress = useMemo(() => computeProgress(review, fw), [review, fw]);
  const [guideOpen, setGuideOpen] = useState(false);
  const facts = review.facts;
  const totalWords = facts.words ?? 0;
  const readMinutes = Math.max(1, Math.round(totalWords / 220));
  const aimsEntry = doc?.outline.find((o) => /aims?|objectives?/i.test(o.title));
  const reflowDoc = useStore((s) => (doc ? s.reflow[doc.id]?.doc : undefined));
  const viewMode = useStore((s) => s.viewMode);
  const claims = useMemo(() => (reflowDoc ? claimsFromReflow(reflowDoc) : doc?.status === 'ready' ? claimsFromPages(doc.pages) : []), [reflowDoc, doc]);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const goToClaim = (c: (typeof claims)[number]) => {
    if (!doc) return;
    if (viewMode === 'read' && c.blockId) return useStore.getState().jumpTo({ docId: doc.id, page: c.page, blockId: c.blockId });
    const pageText = doc.pages[c.page - 1];
    const rect = pageText ? rectsForQuote(pageText, c.sentence.slice(0, 80))[0] : undefined;
    useStore.getState().jumpTo({ docId: doc.id, page: c.page, rect });
  };

  const setFact = (key: keyof QuickFacts, value: string) =>
    update((r) => {
      (r.facts as Record<string, unknown>)[key] = value;
    });

  return (
    <div className="brief">
      <section className="card coach">
        <div className="coach-ring">
          <ProgressRing value={progress.percent} size={56} stroke={5} label={`${progress.percent}%`} />
        </div>
        <div className="coach-text">
          <div className="card-title">
            <Compass size={14} /> {progress.percent >= 100 ? 'Ready to export' : 'Next step'}
          </div>
          <p>{progress.nextStep}</p>
        </div>
      </section>

      {doc && doc.status === 'loading' && (
        <section className="card">
          <div className="card-title">{readingLabel(doc)}</div>
          <div className="progress-bar">
            <span style={{ width: `${Math.round(doc.progress * 100)}%` }} />
          </div>
          <p className="card-hint">You can start reading now. The facts, outline, search, and checklist evidence fill in when this finishes.</p>
        </section>
      )}

      {review.annotations.length + Object.keys(review.scores).length > 0 && (
        <section className="card">
          <div className="card-title">
            <Gauge size={14} /> Scorecard
            <button type="button" className="link" onClick={() => useStore.getState().setTab('score')}>
              Open Score
            </button>
          </div>
          <p className="card-hint">Where the review stands. Click a criterion to jump to it.</p>
          <Scorecard />
        </section>
      )}

      <section className="card">
        <div className="card-title">At a glance</div>
        <p className="card-hint">Detected from the PDF. Click any value to correct it.</p>
        <dl className="facts">
          {FIELDS.map((f) => (
            <div key={f.key} className="fact">
              <dt>{f.label}</dt>
              <dd>
                <input value={(facts[f.key] as string | undefined) ?? ''} placeholder="Not detected" onChange={(e) => setFact(f.key, e.target.value)} aria-label={f.label} spellCheck={false} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="due-row">
          <label className="field-inline">
            <span>Due</span>
            <input type="date" value={review.dueDate ?? ''} aria-label="Due date" onChange={(e) => void useStore.getState().setReviewFields(review.id, { dueDate: e.target.value || null })} />
          </label>
          {review.dueDate && (
            <span className={`due due-${dueLabel(review.dueDate).level}`}>{dueLabel(review.dueDate).text}</span>
          )}
        </div>
        <div className="stat-row">
          <span title="Pages across all documents">{plural(review.docs.reduce((a, d) => a + d.pages, 0), 'page')}</span>
          {totalWords > 0 && <span>{totalWords.toLocaleString()} words, about {readMinutes} min to read</span>}
          {facts.figures ? <span>{plural(facts.figures, 'figure')}</span> : null}
          {facts.tables ? <span>{plural(facts.tables, 'table')}</span> : null}
          {facts.references ? <span>{plural(facts.references, 'reference')}</span> : null}
        </div>
      </section>

      {claims.length > 0 && doc && (
        <section className="card">
          <button type="button" className="card-title card-toggle" onClick={() => setClaimsOpen((v) => !v)} aria-expanded={claimsOpen}>
            <FlaskConical size={14} /> Preliminary data
            <span className="muted small">{plural(claims.length, 'claim')}</span>
            <ChevronDown size={14} className={`chev ${claimsOpen ? 'is-open' : ''}`} />
          </button>
          {claimsOpen && (
            <>
              <p className="card-hint">Every sentence where the applicants say they have already shown something, with the figure it leans on. Worth a sceptical look.</p>
              <ul className="claims" aria-label="Preliminary data claims">
                {claims.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="claim" onClick={() => goToClaim(c)} title={`Go to p. ${c.page}`}>
                      <span className="claim-text">{c.sentence}</span>
                      <span className="claim-meta">
                        p. {c.page}
                        {c.figureLabels.map((l) => (
                          <span key={l} className="chip chip-quiet">
                            {l}
                          </span>
                        ))}
                      </span>
                    </button>
                    {c.figures.length > 0 && (
                      <button type="button" className="link claim-fig" onClick={() => useStore.getState().openFigure(doc.id, c.figures[0])}>
                        Open figure
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <div className="card-title">
          <Target size={14} /> Aims
          {aimsEntry && doc && (
            <button type="button" className="link" onClick={() => useStore.getState().jumpTo({ docId: doc.id, page: aimsEntry.page, rect: { x: 0, y: aimsEntry.y, w: 1, h: 0.02 } })}>
              Go to p. {aimsEntry.page}
            </button>
          )}
        </div>
        {facts.aims?.length ? (
          <ol className="aims">
            {facts.aims.map((a, i) => (
              <li key={i}>{a.replace(/^Aim \S+:\s*/, '')}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">No numbered aims were detected. Use the outline to find the objectives.</p>
        )}
      </section>

      {facts.keyTerms?.length ? (
        <section className="card">
          <div className="card-title">Vocabulary</div>
          <div className="chips">
            {facts.keyTerms.map((k) => (
              <button
                key={k}
                type="button"
                className="chip"
                onClick={() => {
                  const s = useStore.getState();
                  s.setSearch(k);
                  s.setNavTab('search');
                }}
                title={`Search for “${k}”`}
              >
                {k}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <button type="button" className="card-title card-toggle" onClick={() => setGuideOpen((v) => !v)} aria-expanded={guideOpen}>
          <Sparkles size={14} /> How {fw.agency === 'Any' ? 'this rubric' : fw.agency} reviews
          <ChevronDown size={14} className={`chev ${guideOpen ? 'is-open' : ''}`} />
        </button>
        <p className="card-hint">{fw.blurb}</p>
        {guideOpen && (
          <ul className="guidance">
            {fw.guidance.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card how">
        <div className="card-title">Working in Panelist</div>
        <ol className="how-list">
          <li>Read. Select a passage and press <kbd>S</kbd>, <kbd>W</kbd>, <kbd>Q</kbd>, or <kbd>N</kbd> to tag it.</li>
          <li>Score each criterion, with your rationale. Tagged notes attach to criteria automatically.</li>
          <li>Resolve the checklist, then export the draft as Word or Markdown.</li>
        </ol>
      </section>
    </div>
  );
}

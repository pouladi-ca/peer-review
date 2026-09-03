import { AlertCircle, ArrowRight, CheckCircle2, Circle, Lightbulb } from 'lucide-react';
import { useStore } from '../lib/store';
import { getFramework } from '../lib/frameworks';
import { computeReadiness, type ScorecardRow } from '../lib/readiness';
import { useMemo } from 'react';

function swatch(goodness?: number): string {
  if (goodness === undefined) return 'var(--surface-3)';
  const hue = Math.round(goodness * 125); // red -> green
  return `hsl(${hue} 55% 48%)`;
}

/** A compact board: every core criterion with its score and evidence counts. */
export function Scorecard() {
  const review = useStore((s) => s.review)!;
  const fw = getFramework(review.frameworkId);
  const readiness = useMemo(() => computeReadiness(review, fw), [review, fw]);

  const go = (id: string) => {
    const s = useStore.getState();
    s.setTab('score');
    setTimeout(() => document.getElementById(`crit-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  };

  return (
    <div className="scorecard">
      {readiness.rows.map((row) => (
        <button key={row.id} type="button" className="sc-row" onClick={() => go(row.id)} title={`Go to ${row.short}`}>
          <span className="sc-swatch" style={{ background: swatch(row.goodness) }}>
            {row.scored ? (fw.criterionScale.kind === 'numeric' || fw.criteria.find((c) => c.id === row.id)?.scale?.kind === 'numeric' ? String(row.scoreValue) : '') : ''}
          </span>
          <span className="sc-name">{row.short}</span>
          <span className="sc-score">{row.scored ? row.scoreText.replace(/^[\d.]+\s*/, '') || 'Rated' : <em>Not scored</em>}</span>
          <span className="sc-dots">
            <Dots row={row} />
          </span>
        </button>
      ))}
    </div>
  );
}

function Dots({ row }: { row: ScorecardRow }) {
  const items: { cls: string; n: number }[] = [
    { cls: 'strength', n: row.strengths },
    { cls: 'weakness', n: row.weaknesses },
    { cls: 'question', n: row.questions },
  ].filter((x) => x.n > 0);
  if (!items.length) return <span className="sc-noev">no evidence</span>;
  return (
    <>
      {items.map((x) => (
        <span key={x.cls} className={`sc-pill sc-${x.cls}`}>
          {x.n}
        </span>
      ))}
    </>
  );
}

/** A "before you submit" panel: blockers that must be resolved and thoroughness nudges. */
export function SubmitCheck() {
  const review = useStore((s) => s.review)!;
  const fw = getFramework(review.frameworkId);
  const { blockers, suggestions, ready } = useMemo(() => computeReadiness(review, fw), [review, fw]);

  const jump = (tab: 'brief' | 'notes' | 'score' | 'checklist' | 'draft') => useStore.getState().setTab(tab);

  if (ready && suggestions.length === 0) {
    return (
      <div className="submit-ready">
        <CheckCircle2 size={18} />
        <div>
          <strong>This review is complete.</strong>
          <p>Every criterion is scored with a rationale, and nothing is left open. Export it below.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="submit-check">
      {blockers.length > 0 && (
        <ul className="sc-items">
          {blockers.map((b) => (
            <li key={b.id} className="sc-item is-blocker">
              <AlertCircle size={14} />
              <span>{b.text}</span>
              <button type="button" className="sc-jump" onClick={() => jump(b.tab)} aria-label={`Go to ${b.tab}`}>
                <ArrowRight size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <ul className="sc-items">
          {suggestions.map((sug) => (
            <li key={sug.id} className="sc-item is-suggestion">
              {sug.id === 'coi' ? <Circle size={14} /> : <Lightbulb size={14} />}
              <span>{sug.text}</span>
              <button type="button" className="sc-jump" onClick={() => jump(sug.tab)} aria-label={`Go to ${sug.tab}`}>
                <ArrowRight size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {blockers.length === 0 && <p className="sc-foot">No blockers remain. The suggestions above are optional but make for a more thorough, balanced review.</p>}
    </div>
  );
}

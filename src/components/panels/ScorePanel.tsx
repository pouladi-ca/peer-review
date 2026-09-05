import { useMemo, useState } from 'react';
import { useFramework } from '../../hooks/useFramework';
import { ChevronDown, Target, AlertTriangle, MapPin } from 'lucide-react';
import { useStore } from '../../lib/store';
import { criterionScale, scoreLabel, type Criterion, type ScaleDef } from '../../lib/frameworks';
import type { Annotation } from '../../lib/types';
import { AutoTextarea, KindIcon, KIND_ORDER } from '../ui';
import { clip } from '../../lib/format';

export function ScorePanel() {
  const review = useStore((s) => s.review)!;
  const fw = useFramework(review.frameworkId);
  const core = fw.criteria.filter((c) => c.group === 'core');
  const additional = fw.criteria.filter((c) => c.group === 'additional');
  const [showAdditional, setShowAdditional] = useState(false);

  const consistency = useMemo(() => {
    if (fw.overall.scale.kind !== 'numeric' || fw.criterionScale.kind !== 'numeric') return null;
    const nums = core
      .map((c) => review.scores[c.id]?.score)
      .filter((s) => s !== undefined && s !== '')
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    const overall = Number(review.overall.score);
    if (nums.length < 2 || review.overall.score === undefined || Number.isNaN(overall)) return null;
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const range = fw.overall.scale.max - fw.overall.scale.min;
    const gap = overall - mean;
    if (Math.abs(gap) < range * 0.2) return null;
    const better = fw.overall.scale.bestIsLow ? gap < 0 : gap > 0;
    return `Your overall rating is noticeably ${better ? 'better' : 'worse'} than your criterion scores suggest (mean ${mean.toFixed(1)}). That can be right, but the rationale should say why.`;
  }, [review.scores, review.overall.score, core, fw]);

  return (
    <div className="score">
      <p className="panel-intro">
        Score each criterion, then write the rationale that your bullets support. Use <Target size={12} className="inline-icon" /> to focus a criterion so new notes attach to it.
      </p>
      {core.map((c) => (
        <CriterionCard key={c.id} criterion={c} />
      ))}

      {additional.length > 0 && (
        <section className="card">
          <button type="button" className="card-title card-toggle" onClick={() => setShowAdditional((v) => !v)} aria-expanded={showAdditional}>
            Additional review criteria
            <span className="muted small">{additional.filter((c) => review.scores[c.id]?.score).length}/{additional.length} rated</span>
            <ChevronDown size={14} className={`chev ${showAdditional ? 'is-open' : ''}`} />
          </button>
          {showAdditional && additional.map((c) => <CriterionCard key={c.id} criterion={c} compact />)}
        </section>
      )}

      <OverallCard consistency={consistency} />
    </div>
  );
}

function ScoreControl({ scale, value, onChange, name }: { scale: ScaleDef; value: number | string | undefined; onChange: (v: number | string | undefined) => void; name: string }) {
  if (scale.kind === 'categorical') {
    return (
      <div className="score-cat" role="radiogroup" aria-label={name}>
        {scale.options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`score-cat-btn ${value === o.value ? 'is-on' : ''}`} onClick={() => onChange(value === o.value ? undefined : o.value)} title={o.hint}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  const step = scale.step ?? 1;
  if (step < 1) {
    const n = value === undefined || value === '' ? undefined : Number(value);
    return (
      <div className="score-slider">
        <input type="range" min={scale.min} max={scale.max} step={step} value={n ?? scale.min} onChange={(e) => onChange(Number(e.target.value))} aria-label={name} className={n === undefined ? 'is-unset' : ''} />
        <input type="number" min={scale.min} max={scale.max} step={step} value={n ?? ''} placeholder="–" onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} aria-label={`${name} value`} />
        <span className="score-label">{n === undefined ? 'Not rated' : scoreLabel(scale, n).replace(/^[\d.]+\s*/, '')}</span>
      </div>
    );
  }
  const values: number[] = [];
  for (let v = scale.min; v <= scale.max; v += step) values.push(v);
  const n = value === undefined || value === '' ? undefined : Number(value);
  return (
    <div className="score-num">
      <div className="score-btns" role="radiogroup" aria-label={name}>
        {values.map((v) => {
          const t = (v - scale.min) / (scale.max - scale.min);
          const goodness = scale.bestIsLow ? 1 - t : t;
          return (
            <button key={v} type="button" role="radio" aria-checked={n === v} className={`score-btn ${n === v ? 'is-on' : ''}`} style={{ '--good': goodness } as React.CSSProperties} onClick={() => onChange(n === v ? undefined : v)} title={scale.labels?.[v]}>
              {v}
            </button>
          );
        })}
      </div>
      <div className="score-label">{n === undefined ? scale.hint ?? 'Not scored' : scoreLabel(scale, n).replace(/^\d+\s*/, '')}</div>
    </div>
  );
}

function LinkedNotes({ notes }: { notes: Annotation[] }) {
  if (!notes.length) return <p className="muted small">No notes attached yet. Tag passages while reading, or reassign notes from the Notes tab.</p>;
  const counts = KIND_ORDER.map((k) => ({ k, n: notes.filter((a) => a.kind === k).length })).filter((x) => x.n);
  return (
    <div className="linked">
      <div className="linked-counts">
        {counts.map(({ k, n }) => (
          <span key={k} className={`chip chip-${k}`}>
            <KindIcon kind={k} size={11} /> {n}
          </span>
        ))}
      </div>
      <ul className="linked-list">
        {notes.slice(0, 6).map((a) => (
          <li key={a.id} className={`linked-item kind-${a.kind}`}>
            <button
              type="button"
              onClick={() => {
                const s = useStore.getState();
                s.selectNote(a.id);
                s.jumpTo({ docId: a.docId, page: a.page, rect: a.rects[0], flashNoteId: a.id });
              }}
              title="Go to this passage"
            >
              <KindIcon kind={a.kind} size={11} />
              <span>{clip(a.comment || a.quote, 90)}</span>
              <span className="linked-page">
                <MapPin size={10} /> {a.page}
              </span>
            </button>
          </li>
        ))}
        {notes.length > 6 && (
          <li className="muted small">
            <button
              type="button"
              className="link"
              onClick={() => {
                const s = useStore.getState();
                s.setFilter({ criterionId: notes[0].criterionId });
                s.setTab('notes');
              }}
            >
              See all {notes.length} in Notes
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function CriterionCard({ criterion: c, compact }: { criterion: Criterion; compact?: boolean }) {
  const review = useStore((s) => s.review)!;
  const update = useStore((s) => s.update);
  const fw = useFramework(review.frameworkId);
  const scale = criterionScale(fw, c);
  const score = review.scores[c.id];
  const focused = review.focusCriterionId === c.id;
  const [promptsOpen, setPromptsOpen] = useState(false);
  const notes = useMemo(() => review.annotations.filter((a) => a.criterionId === c.id).sort((a, b) => a.page - b.page), [review.annotations, c.id]);

  const set = (patch: Partial<{ score: number | string | undefined; comment: string }>) =>
    update((r) => {
      const cur = r.scores[c.id] ?? { comment: '' };
      r.scores[c.id] = { ...cur, ...patch };
    });

  return (
    <section className={`card criterion ${focused ? 'is-focused' : ''} ${compact ? 'is-compact' : ''}`} id={`crit-${c.id}`}>
      <header className="criterion-head">
        <div>
          <div className="card-title">{c.name}</div>
          <p className="card-hint">{c.description}</p>
        </div>
        {!compact && (
          <button
            type="button"
            className={`focus-btn ${focused ? 'is-on' : ''}`}
            onClick={() =>
              update((r) => {
                r.focusCriterionId = focused ? undefined : c.id;
              })
            }
            title={focused ? 'New notes attach here. Click to stop focusing.' : 'Focus: attach new notes to this criterion'}
            aria-pressed={focused}
          >
            <Target size={14} /> {focused ? 'Focused' : 'Focus'}
          </button>
        )}
      </header>
      {c.prompts.length > 0 && (
        <div className="prompts">
          <button type="button" className="link" onClick={() => setPromptsOpen((v) => !v)} aria-expanded={promptsOpen}>
            {promptsOpen ? 'Hide' : 'Show'} guiding questions ({c.prompts.length})
          </button>
          {promptsOpen && (
            <ul>
              {c.prompts.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ScoreControl scale={scale} value={score?.score} onChange={(v) => set({ score: v })} name={c.name} />
      <AutoTextarea
        minRows={compact ? 1 : 3}
        value={score?.comment ?? ''}
        placeholder={compact ? 'Comment (optional)' : 'Rationale for this score. The tagged strengths and weaknesses below will follow it in the draft.'}
        onChange={(e) => set({ comment: e.target.value })}
        aria-label={`${c.name} rationale`}
      />
      {!compact && <LinkedNotes notes={notes} />}
      {compact && notes.length > 0 && <LinkedNotes notes={notes} />}
    </section>
  );
}

function OverallCard({ consistency }: { consistency: string | null }) {
  const review = useStore((s) => s.review)!;
  const update = useStore((s) => s.update);
  const fw = useFramework(review.frameworkId);
  return (
    <section className="card overall">
      <div className="card-title">{fw.overall.label}</div>
      <p className="card-hint">{fw.overall.description}</p>
      <ScoreControl
        scale={fw.overall.scale}
        value={review.overall.score}
        onChange={(v) =>
          update((r) => {
            r.overall.score = v;
          })
        }
        name={fw.overall.label}
      />
      {consistency && (
        <div className="callout callout-warn">
          <AlertTriangle size={14} /> {consistency}
        </div>
      )}
      {fw.recommendations && (
        <div className="score-cat" role="radiogroup" aria-label="Recommendation">
          {fw.recommendations.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={review.overall.recommendation === r}
              className={`score-cat-btn ${review.overall.recommendation === r ? 'is-on' : ''}`}
              onClick={() =>
                update((rv) => {
                  rv.overall.recommendation = rv.overall.recommendation === r ? undefined : r;
                })
              }
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <AutoTextarea
        minRows={4}
        value={review.overall.comment}
        placeholder="Overall assessment: the two or three things that drove your rating, and how the weaknesses weigh against the strengths."
        onChange={(e) =>
          update((r) => {
            r.overall.comment = e.target.value;
          })
        }
        aria-label="Overall rationale"
      />
    </section>
  );
}

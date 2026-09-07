import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, MessageSquareText, Sparkles, X, ThumbsUp, ThumbsDown, CircleHelp, Gauge } from 'lucide-react';
import { useStore } from '../lib/store';
import { useFramework } from '../hooks/useFramework';
import { scoreLabel } from '../lib/frameworks';
import { draftAsk, draftPitch, EMPTY_PANEL, noteLine, panelCardText, topNotes } from '../lib/panel';
import { copyText } from '../lib/export/download';
import { AutoTextarea } from './ui';
import { ScoreControl } from './panels/ScorePanel';

const SPEAKERS = ['Me', 'R2', 'R3', 'Chair', 'Program'];

/**
 * Meeting mode: the panel card full screen, offline, with big type. The reviewer opens
 * with the pitch, has the top strengths, weaknesses, and questions in hand, logs what
 * others said, and records the score after discussion with the reason.
 */
export function MeetingView() {
  const open = useStore((s) => s.meetingOpen);
  if (!open) return null;
  return <Meeting />;
}

function Meeting() {
  const review = useStore((s) => s.review)!;
  const fw = useFramework(review.frameworkId);
  const panel = review.panel ?? EMPTY_PANEL;
  const notify = useStore((s) => s.notify);
  const close = () => useStore.getState().closeMeeting();
  const [who, setWho] = useState('R2');
  const [said, setSaid] = useState('');
  const [reason, setReason] = useState(panel.finalReason ?? '');
  const [revised, setRevised] = useState<number | string | undefined>(panel.finalScore ?? review.overall.score);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [panel.log.length]);

  const strengths = useMemo(() => topNotes(review, 'strength', 2), [review]);
  const weaknesses = useMemo(() => topNotes(review, 'weakness', 2), [review]);
  const myScore = scoreLabel(fw.overall.scale, review.overall.score);
  const finalLabel = panel.finalScore !== undefined && panel.finalScore !== '' ? scoreLabel(fw.overall.scale, panel.finalScore) : '';

  const addSaid = () => {
    if (!said.trim()) return;
    useStore.getState().logDiscussion(who, said);
    setSaid('');
  };

  return (
    <div className="meeting" role="dialog" aria-modal="true" aria-label="Panel">
      <header className="meeting-top">
        <div className="meeting-titles">
          <div className="meeting-kicker">Panel</div>
          <h1 className="meeting-title">{review.title}</h1>
        </div>
        <button type="button" className="btn btn-s" onClick={() => void copyText(panelCardText(review, fw)).then((ok) => notify(ok ? 'Panel card copied.' : 'Copy failed.', ok ? 'success' : 'error'))} title="Copy the whole card as text">
          <Copy size={14} /> Copy card
        </button>
        <button type="button" className="icon-btn" onClick={close} aria-label="Close meeting mode">
          <X size={20} />
        </button>
      </header>

      <div className="meeting-body">
        <section className="meeting-score">
          <div className="meeting-score-main">
            <span className="meeting-score-label">My score</span>
            <span className="meeting-score-value">{myScore || 'not set'}</span>
            {review.overall.recommendation && <span className="chip chip-quiet">{review.overall.recommendation}</span>}
          </div>
          {finalLabel && (
            <div className="meeting-score-final">
              <span className="meeting-score-label">After discussion</span>
              <span className="meeting-score-value">{finalLabel}</span>
              {panel.finalReason && <span className="muted">{panel.finalReason}</span>}
            </div>
          )}
        </section>

        <section className="meeting-card">
          <div className="meeting-card-head">
            <h2>Pitch</h2>
            <button type="button" className="link" onClick={() => useStore.getState().updatePanel({ pitch: draftPitch(review, fw) })} title="Draft two sentences from the facts, the score, and the top notes">
              <Sparkles size={12} /> {panel.pitch ? 'Redraft' : 'Draft'}
            </button>
          </div>
          <AutoTextarea className="meeting-ta" minRows={3} value={panel.pitch} placeholder={draftPitch(review, fw)} onChange={(e) => useStore.getState().updatePanel({ pitch: e.target.value })} aria-label="Pitch" />
        </section>

        <div className="meeting-cols">
          <section className="meeting-card">
            <h2>
              <ThumbsUp size={15} className="is-strength" /> Strengths
            </h2>
            {strengths.length ? (
              <ul className="meeting-list">
                {strengths.map((a) => (
                  <li key={a.id}>{noteLine(a)}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No strengths tagged.</p>
            )}
          </section>
          <section className="meeting-card">
            <h2>
              <ThumbsDown size={15} className="is-weakness" /> Weaknesses
            </h2>
            {weaknesses.length ? (
              <ul className="meeting-list">
                {weaknesses.map((a) => (
                  <li key={a.id} className={a.severity === 'major' ? 'is-major' : ''}>
                    {noteLine(a)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No weaknesses tagged.</p>
            )}
          </section>
        </div>

        <section className="meeting-card">
          <div className="meeting-card-head">
            <h2>
              <CircleHelp size={15} className="is-question" /> Questions for the panel
            </h2>
            <button type="button" className="link" onClick={() => useStore.getState().updatePanel({ ask: draftAsk(review) })} title="Prefill from your question notes">
              <Sparkles size={12} /> From my questions
            </button>
          </div>
          <AutoTextarea className="meeting-ta" minRows={2} value={panel.ask} placeholder={draftAsk(review) || 'What do you want the other reviewers or the program officer to weigh in on?'} onChange={(e) => useStore.getState().updatePanel({ ask: e.target.value })} aria-label="Questions for the panel" />
        </section>

        <section className="meeting-card">
          <h2>
            <MessageSquareText size={15} /> Discussion
          </h2>
          <ul className="meeting-log" aria-label="Discussion log">
            {panel.log.map((e) => (
              <li key={e.id}>
                <span className="meeting-log-who">{e.who}</span>
                <span className="meeting-log-text">{e.text}</span>
                <span className="meeting-log-time">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
            {panel.log.length === 0 && <li className="muted">Nothing logged yet.</li>}
            <div ref={logEnd} />
          </ul>
          <div className="meeting-say">
            <div className="meeting-who" role="radiogroup" aria-label="Who said it">
              {SPEAKERS.map((w) => (
                <button key={w} type="button" role="radio" aria-checked={who === w} className={`chip ${who === w ? 'is-on' : ''}`} onClick={() => setWho(w)}>
                  {w}
                </button>
              ))}
            </div>
            <div className="meeting-say-row">
              <input
                value={said}
                onChange={(e) => setSaid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSaid();
                  }
                }}
                placeholder={`What ${who === 'Me' ? 'I' : who} said`}
                aria-label="What was said"
              />
              <button type="button" className="btn btn-primary" onClick={addSaid} disabled={!said.trim()}>
                Log
              </button>
            </div>
          </div>
        </section>

        <section className="meeting-card">
          <h2>
            <Gauge size={15} /> Score after discussion
          </h2>
          <ScoreControl scale={fw.overall.scale} value={revised} onChange={setRevised} name="Score after discussion" />
          <div className="meeting-say-row">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it moved, or why it did not" aria-label="Reason for the score after discussion" />
            <button type="button" className="btn btn-primary" onClick={() => useStore.getState().reviseScore(revised, reason)} disabled={revised === undefined || revised === ''}>
              Record
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

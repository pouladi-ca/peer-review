import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, BookText, Quote, Scale, Search, X } from 'lucide-react';
import { VocabComplete } from './VocabComplete';
import { useVocabulary } from '../hooks/useVocabulary';
import { biasCheck } from '../lib/writing/bias';
import { lintApplicantFacing, lintRationale } from '../lib/writing/lints';
import { phrasesFor, userPhrasesFor, USE_LABELS, type Phrase, type PhraseUse, type UserPhrase } from '../lib/writing/phrasebook';
import { useStore } from '../lib/store';
import { Bookmark, Trash2 } from 'lucide-react';
import { calibration, scaleGoodness, wordsFor } from '../lib/writing/intensity';
import { composeFromEvidence } from '../lib/writing/compose';
import { appendParagraph, insertAtCaret, type Insertion } from '../lib/writing/insert';
import type { ScaleDef } from '../lib/frameworks';
import type { Annotation, DocMeta } from '../lib/types';

interface Props {
  /** The controlled textarea the aids write into. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  /** Which kinds of phrase fit this box. */
  uses: PhraseUse[];
  /** The criterion being written about, for ranking phrases. */
  criterion?: { name: string; keywords?: string[] };
  /** When present, the intensity ladder and calibration check follow this score. */
  scale?: ScaleDef;
  score?: number | string;
  scoreLabel?: string;
  /** Tagged notes that can be composed into sentences. */
  evidence?: Annotation[];
  docs?: DocMeta[];
  /** Short name for this box in lint messages. */
  label?: string;
  /** The box is read by the applicant: keep panel talk out of it. */
  applicantFacing?: boolean;
}

/**
 * Writing aids under a rationale box: a phrasebook keyed by what the reviewer is trying
 * to say, an intensity ladder that follows the score, and a composer that turns tagged
 * evidence into sentences. Everything is deterministic and stays on the device.
 */
export function WritingAids({ textareaRef, value, onChange, uses, criterion, scale, score, scoreLabel, evidence = [], docs = [], label = 'This box', applicantFacing = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [use, setUse] = useState<PhraseUse | 'all'>('all');
  const [saving, setSaving] = useState<{ text: string; use: PhraseUse } | null>(null);
  const userPhrases = useStore((s) => s.userPhrases);
  const pendingSelect = useRef<Insertion['select'] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const goodness = scale ? scaleGoodness(scale, score) : undefined;
  const ladder = goodness === undefined ? null : wordsFor(goodness);
  const mismatch = useMemo(() => (scale ? calibration(value, scale, score, scoreLabel ? `a score of ${scoreLabel}` : 'this score') : null), [value, scale, score, scoreLabel]);
  const fresh = useMemo(() => (evidence.length ? composeFromEvidence(evidence, docs, value) : []), [evidence, docs, value]);
  const terms = useVocabulary();
  const lints = useMemo(() => {
    const out = lintRationale(value, { hasEvidence: evidence.length > 0, label });
    if (applicantFacing) out.push(...lintApplicantFacing(value, label));
    return out.filter((l) => l.id !== 'specific' || uses.includes('strength') || uses.includes('major')); // specificity applies to criterion boxes
  }, [value, evidence.length, label, applicantFacing, uses]);
  const bias = useMemo(() => biasCheck(value), [value]);

  const list = useMemo(() => phrasesFor(use === 'all' ? uses : [use], criterion, query), [use, uses, criterion, query]);
  const mine = useMemo(() => userPhrasesFor(userPhrases, use === 'all' ? uses : [use], query), [userPhrases, use, uses, query]);

  const selectedText = () => {
    const el = textareaRef.current;
    if (!el) return '';
    return el.value.slice(el.selectionStart, el.selectionEnd).trim();
  };
  const startSaving = () => setSaving({ text: selectedText(), use: use === 'all' ? uses[0] : use });
  const commitSave = () => {
    if (!saving?.text.trim()) return;
    void useStore.getState().saveUserPhrase(saving.text, saving.use);
    setSaving(null);
  };

  // Apply the caret selection once React has rendered the new value.
  useEffect(() => {
    const sel = pendingSelect.current;
    const el = textareaRef.current;
    if (!sel || !el) return;
    pendingSelect.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [value, textareaRef]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => searchRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const apply = (ins: Insertion) => {
    pendingSelect.current = ins.select;
    onChange(ins.value);
  };

  const insertPhrase = (ph: Phrase | UserPhrase) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    apply(insertAtCaret(value, start, end, ph.text));
    setOpen(false);
  };

  const insertEvidence = () => {
    if (!fresh.length) return;
    apply(appendParagraph(value, fresh.join(' ')));
  };

  return (
    <div className="aids">
      <div className="aids-bar">
        <div className="aids-wrap">
          <button type="button" className={`btn btn-s btn-ghost ${open ? 'is-on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" title="Phrases for what you are trying to say, with blanks to fill">
            <BookText size={13} /> Phrases
          </button>
          {open && (
            <>
              <div className="more-scrim" onClick={() => setOpen(false)} />
              <div className="popover aids-pop" role="dialog" aria-label="Phrasebook">
                <div className="aids-pop-head">
                  <label className="aids-search">
                    <Search size={13} />
                    <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search phrases" aria-label="Search phrases" />
                  </label>
                  <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                    <X size={14} />
                  </button>
                </div>
                <div className="aids-uses" role="radiogroup" aria-label="Kind of phrase">
                  <button type="button" role="radio" aria-checked={use === 'all'} className={`chip ${use === 'all' ? 'is-on' : ''}`} onClick={() => setUse('all')}>
                    All
                  </button>
                  {uses.map((u) => (
                    <button key={u} type="button" role="radio" aria-checked={use === u} className={`chip ${use === u ? 'is-on' : ''}`} onClick={() => setUse(u)}>
                      {USE_LABELS[u]}
                    </button>
                  ))}
                </div>
                <div className="aids-mine-bar">
                  <span className="muted small">{mine.length ? `${mine.length} of yours` : 'Save phrases you reuse'}</span>
                  <button type="button" className="btn btn-s btn-ghost" onClick={startSaving} title="Save the text selected in the box as a phrase of yours">
                    <Bookmark size={12} /> Save selection
                  </button>
                </div>
                {saving && (
                  <form
                    className="aids-save"
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitSave();
                    }}
                  >
                    <textarea value={saving.text} onChange={(e) => setSaving({ ...saving, text: e.target.value })} rows={2} placeholder="Select text in the box first, or type a phrase. Put blanks in {braces}." aria-label="Phrase to save" />
                    <div className="aids-save-row">
                      <select value={saving.use} onChange={(e) => setSaving({ ...saving, use: e.target.value as PhraseUse })} aria-label="Kind of phrase">
                        {(Object.keys(USE_LABELS) as PhraseUse[]).map((u) => (
                          <option key={u} value={u}>
                            {USE_LABELS[u]}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-s btn-ghost" onClick={() => setSaving(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-s btn-primary" disabled={!saving.text.trim()}>
                        Save
                      </button>
                    </div>
                  </form>
                )}
                <ul className="aids-list">
                  {mine.map((ph) => (
                    <li key={ph.id} className="aids-mine">
                      <button type="button" className="aids-phrase" onClick={() => insertPhrase(ph)}>
                        <span className="aids-use">Yours · {USE_LABELS[ph.use]}</span>
                        <span className="aids-text">{renderPhrase(ph.text)}</span>
                      </button>
                      <button type="button" className="icon-btn aids-del" onClick={() => void useStore.getState().deleteUserPhrase(ph.id)} aria-label={`Delete phrase: ${ph.text.slice(0, 40)}`} title="Delete this phrase">
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                  {list.map((ph) => (
                    <li key={ph.id}>
                      <button type="button" className="aids-phrase" onClick={() => insertPhrase(ph)}>
                        <span className="aids-use">{USE_LABELS[ph.use]}</span>
                        <span className="aids-text">{renderPhrase(ph.text)}</span>
                      </button>
                    </li>
                  ))}
                  {list.length === 0 && mine.length === 0 && <li className="muted small aids-empty">Nothing matches.</li>}
                </ul>
                <div className="aids-foot muted small">Blanks in braces are selected after insertion: type to replace them.</div>
              </div>
            </>
          )}
        </div>
        {evidence.length > 0 && (
          <button type="button" className="btn btn-s btn-ghost" onClick={insertEvidence} disabled={fresh.length === 0} title={fresh.length ? `Add ${fresh.length} sentence${fresh.length === 1 ? '' : 's'} written from the tagged notes not yet mentioned here` : 'Every tagged note is already reflected here'}>
            <Quote size={13} /> From evidence{fresh.length ? ` (${fresh.length})` : ''}
          </button>
        )}
        {ladder && (
          <span className="aids-ladder muted small" title="Vocabulary whose intensity matches the score">
            Words for {scoreLabel ?? 'this score'}: <em>{ladder.praise.slice(0, 3).join(', ')}</em> · <em>{ladder.concern.slice(0, 2).join(', ')}</em>
          </span>
        )}
      </div>
      {mismatch && (
        <div className="callout callout-warn aids-callout" role="status">
          <AlertTriangle size={14} /> {mismatch.message}
        </div>
      )}
      {(lints.length > 0 || bias.length > 0) && (
        <ul className="aids-notes" aria-label="Writing notes">
          {bias.map((b) => (
            <li key={`bias-${b.id}`} className="is-bias">
              <Scale size={12} /> <span>“{b.phrase}”: {b.reason}</span>
            </li>
          ))}
          {lints.map((l) => (
            <li key={l.id}>
              <span>{l.text.replace(/^[^:]+: /, '')}</span>
            </li>
          ))}
        </ul>
      )}
      <VocabComplete textareaRef={textareaRef} value={value} onChange={onChange} terms={terms} />
    </div>
  );
}

function renderPhrase(text: string) {
  const parts = text.split(/(\{[^}]*\})/g);
  return parts.map((part, i) => (part.startsWith('{') ? <em key={i}>{part}</em> : <span key={i}>{part}</span>));
}

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, BookText, Quote, Search, X } from 'lucide-react';
import { phrasesFor, USE_LABELS, type Phrase, type PhraseUse } from '../lib/writing/phrasebook';
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
}

/**
 * Writing aids under a rationale box: a phrasebook keyed by what the reviewer is trying
 * to say, an intensity ladder that follows the score, and a composer that turns tagged
 * evidence into sentences. Everything is deterministic and stays on the device.
 */
export function WritingAids({ textareaRef, value, onChange, uses, criterion, scale, score, scoreLabel, evidence = [], docs = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [use, setUse] = useState<PhraseUse | 'all'>('all');
  const pendingSelect = useRef<Insertion['select'] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const goodness = scale ? scaleGoodness(scale, score) : undefined;
  const ladder = goodness === undefined ? null : wordsFor(goodness);
  const mismatch = useMemo(() => (scale ? calibration(value, scale, score, scoreLabel ? `a score of ${scoreLabel}` : 'this score') : null), [value, scale, score, scoreLabel]);
  const fresh = useMemo(() => (evidence.length ? composeFromEvidence(evidence, docs, value) : []), [evidence, docs, value]);

  const list = useMemo(() => phrasesFor(use === 'all' ? uses : [use], criterion, query), [use, uses, criterion, query]);

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
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const apply = (ins: Insertion) => {
    pendingSelect.current = ins.select;
    onChange(ins.value);
  };

  const insertPhrase = (ph: Phrase) => {
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
                <ul className="aids-list">
                  {list.map((ph) => (
                    <li key={ph.id}>
                      <button type="button" className="aids-phrase" onClick={() => insertPhrase(ph)}>
                        <span className="aids-use">{USE_LABELS[ph.use]}</span>
                        <span className="aids-text">{renderPhrase(ph.text)}</span>
                      </button>
                    </li>
                  ))}
                  {list.length === 0 && <li className="muted small aids-empty">Nothing matches.</li>}
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
    </div>
  );
}

function renderPhrase(text: string) {
  const parts = text.split(/(\{[^}]*\})/g);
  return parts.map((part, i) => (part.startsWith('{') ? <em key={i}>{part}</em> : <span key={i}>{part}</span>));
}

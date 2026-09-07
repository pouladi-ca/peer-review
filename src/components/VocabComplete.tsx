import { useEffect, useRef, useState, type RefObject } from 'react';
import { suggest, wordBeforeCaret, type Term } from '../lib/writing/vocab';
import { isTouchLike } from '../hooks/useMedia';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  terms: Term[];
}

interface Popup {
  items: Term[];
  start: number;
  caret: number;
  x: number;
  y: number;
}

/**
 * Autocomplete from the proposal's own vocabulary. Listens natively on the textarea so it
 * works with any controlled input. With a keyboard: a floating list, Tab or Enter accepts,
 * arrows move, Escape dismisses. On a touch screen: a row of chips in the flow under the
 * box (a floating list would sit behind the on-screen keyboard), tapped to accept, and
 * the Return key keeps its usual meaning.
 */
export function VocabComplete({ textareaRef, value, onChange, terms }: Props) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [index, setIndex] = useState(0);
  const touch = isTouchLike();
  const latest = useRef({ value, onChange, terms, popup, index });
  const acceptRef = useRef<((t: Term) => void) | null>(null);
  useEffect(() => {
    latest.current = { value, onChange, terms, popup, index };
  });

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const compute = () => {
      const { terms: ts } = latest.current;
      if (!ts.length || el.selectionStart !== el.selectionEnd) return setPopup(null);
      const caret = el.selectionStart;
      const { start, text } = wordBeforeCaret(el.value, caret);
      const items = suggest(ts, text);
      if (!items.length) return setPopup(null);
      const r = el.getBoundingClientRect();
      setIndex(0);
      setPopup({ items, start, caret, x: r.left, y: Math.min(r.bottom, window.innerHeight - 8) });
    };

    const accept = (term: Term) => {
      const { popup: p, onChange: change } = latest.current;
      if (!p) return;
      const before = el.value.slice(0, p.start);
      const after = el.value.slice(p.caret);
      const next = before + term.text + after;
      change(next);
      const at = p.start + term.text.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(at, at);
      });
      setPopup(null);
    };

    const onKey = (e: KeyboardEvent) => {
      const { popup: p, index: i } = latest.current;
      if (!p || touch) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((cur) => (cur + (e.key === 'ArrowDown' ? 1 : p.items.length - 1)) % p.items.length);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        accept(p.items[i]);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setPopup(null);
      }
    };
    const onBlur = () => setTimeout(() => setPopup(null), 120);
    const onScroll = () => setPopup(null);

    el.addEventListener('input', compute);
    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, true);
    acceptRef.current = accept;
    return () => {
      el.removeEventListener('input', compute);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('blur', onBlur);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [textareaRef, touch]);

  if (!popup) return null;
  if (touch) {
    return (
      <div className="vocab-inline" role="listbox" aria-label="Terms from the proposal">
        {popup.items.slice(0, 4).map((t) => (
          <button key={t.text} type="button" role="option" aria-selected={false} className="chip vocab-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => acceptRef.current?.(t)}>
            {t.text}
          </button>
        ))}
      </div>
    );
  }
  return (
    <ul className="vocab-pop" role="listbox" aria-label="Terms from the proposal" style={{ left: popup.x, top: popup.y }}>
      {popup.items.map((t, i) => (
        <li key={t.text} role="option" aria-selected={i === index}>
          <button type="button" className={i === index ? 'is-on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => acceptRef.current?.(t)}>
            {t.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

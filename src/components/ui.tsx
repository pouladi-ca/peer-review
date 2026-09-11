import { forwardRef, useEffect, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { ThumbsUp, ThumbsDown, CircleHelp, StickyNote, Mic, type LucideIcon } from 'lucide-react';
import { useDictation } from '../hooks/useDictation';
import type { NoteKind } from '../lib/types';

export function ProgressRing({ value, size = 28, stroke = 3, label }: { value: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className="ring" style={{ width: size, height: size }} aria-label={`${pct}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-strong)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct >= 100 ? 'var(--success)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms var(--ease)' }}
        />
      </svg>
      {label !== undefined && <span className="ring-label">{label}</span>}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export const IconButton = forwardRef<HTMLButtonElement, ComponentProps<'button'> & { icon: LucideIcon; label: string; active?: boolean; size?: number }>(
  function IconButton({ icon: Icon, label, active, size = 16, className = '', ...rest }, ref) {
    return (
      <button ref={ref} type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} aria-label={label} title={label} {...rest}>
        <Icon size={size} strokeWidth={1.9} />
      </button>
    );
  },
);

export function Segmented<T extends string>({ value, options, onChange, size = 'm', ariaLabel }: { value: T | undefined; options: { value: T; label: ReactNode; title?: string; tone?: string }[]; onChange: (v: T) => void; size?: 's' | 'm'; ariaLabel?: string }) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`seg-btn ${value === o.value ? 'is-on' : ''}`}
          data-tone={o.tone}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const AutoTextarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'> & { minRows?: number }>(function AutoTextarea({ minRows = 2, className = '', onInput, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const fit = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [rest.value]);
  useEffect(() => {
    const ro = new ResizeObserver(fit);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={setRef}
      rows={minRows}
      className={`ta ${className}`}
      onInput={(e) => {
        fit();
        onInput?.(e);
      }}
      {...rest}
    />
  );
});

export const KIND_META: Record<NoteKind, { label: string; plural: string; key: string; icon: LucideIcon; verb: string }> = {
  strength: { label: 'Strength', plural: 'Strengths', key: 'S', icon: ThumbsUp, verb: 'Mark as strength' },
  weakness: { label: 'Weakness', plural: 'Weaknesses', key: 'W', icon: ThumbsDown, verb: 'Mark as weakness' },
  question: { label: 'Question', plural: 'Questions', key: 'Q', icon: CircleHelp, verb: 'Ask a question' },
  note: { label: 'Note', plural: 'Notes', key: 'N', icon: StickyNote, verb: 'Keep a note' },
};

export const KIND_ORDER: NoteKind[] = ['strength', 'weakness', 'question', 'note'];

export function KindIcon({ kind, size = 14 }: { kind: NoteKind; size?: number }) {
  const Icon = KIND_META[kind].icon;
  return <Icon size={size} strokeWidth={2} className={`kind-icon kind-${kind}`} />;
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={22} strokeWidth={1.6} />
      </div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Wordmark({ size = 'm' }: { size?: 's' | 'm' | 'l' }) {
  return (
    <span className={`wordmark wordmark-${size}`}>
      <span className="wordmark-glyph" aria-hidden>
        <svg viewBox="0 0 24 24" width="1em" height="1em">
          <path d="M5 4h9a5 5 0 0 1 0 10H9v6H5V4zm4 3v4h5a2 2 0 0 0 0-4H9z" fill="currentColor" />
        </svg>
      </span>
      Panelist
    </span>
  );
}

/** A microphone button that appends dictated text to a field. Hidden where speech recognition is unavailable. */
export function DictateButton({ onText, compact }: { onText: (text: string) => void; compact?: boolean }) {
  const d = useDictation(onText);
  if (!d.available) return null;
  return (
    <span className="dictate">
      <button type="button" className={`dictate-btn ${d.listening ? 'is-live' : ''}`} onClick={d.toggle} aria-pressed={d.listening} title={d.listening ? 'Stop dictation' : 'Dictate'}>
        {d.listening ? <span className="rec-dot" /> : <Mic size={compact ? 13 : 14} />}
        {!compact && <span>{d.listening ? 'Stop' : 'Dictate'}</span>}
      </button>
      {(d.listening || d.interim) && <span className="dictate-interim" aria-live="polite">{d.interim || 'Listening…'}</span>}
      {d.error && <span className="dictate-error">{d.error}</span>}
    </span>
  );
}

/** "1,234 / 2,000" for a box with a funder-imposed character limit; warns near the limit and flags overruns. */
export const wordCount = (s: string): number => (s.match(/\S+/g) ?? []).length;

export function CharCount({ value, max, maxWords, className = '' }: { value: string; max?: number; maxWords?: number; className?: string }) {
  if (!max && !maxWords) return null;
  const words = !!maxWords;
  const limit = words ? maxWords! : max!;
  const n = words ? wordCount(value) : value.length;
  const over = n - limit;
  const state = over > 0 ? 'is-over' : n >= limit * 0.9 ? 'is-near' : '';
  return (
    <span className={`charcount ${state} ${className}`} aria-live="polite" title={over > 0 ? `${over.toLocaleString()} ${words ? 'words' : 'characters'} over the limit` : `${(limit - n).toLocaleString()} ${words ? 'words' : 'characters'} remaining`}>
      {n.toLocaleString()} / {limit.toLocaleString()}
      {words ? ' words' : ''}
      {over > 0 && <span className="charcount-over"> · {over.toLocaleString()} over</span>}
    </span>
  );
}

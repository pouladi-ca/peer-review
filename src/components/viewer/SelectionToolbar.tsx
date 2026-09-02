import { useEffect, useRef } from 'react';
import type { NoteKind } from '../../lib/types';
import { KIND_META, KIND_ORDER } from '../ui';

export interface PendingSelection {
  docId: string;
  page: number;
  rects: { x: number; y: number; w: number; h: number }[];
  quote: string;
  anchor: { x: number; y: number; below: boolean };
  criterionName?: string;
}

export function SelectionToolbar({ pending, onPick, onDismiss }: { pending: PendingSelection; onPick: (kind: NoteKind) => void; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    let left = pending.anchor.x - r.width / 2;
    left = Math.max(margin, Math.min(window.innerWidth - r.width - margin, left));
    let top = pending.anchor.below ? pending.anchor.y + 10 : pending.anchor.y - r.height - 10;
    top = Math.max(margin, Math.min(window.innerHeight - r.height - margin, top));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.opacity = '1';
  }, [pending]);

  return (
    <div ref={ref} className="sel-toolbar" role="toolbar" aria-label="Tag selection" onMouseDown={(e) => e.preventDefault()}>
      {KIND_ORDER.map((k) => {
        const m = KIND_META[k];
        const Icon = m.icon;
        return (
          <button key={k} type="button" className={`sel-btn sel-${k}`} onClick={() => onPick(k)} title={`${m.verb} (${m.key})`}>
            <Icon size={14} strokeWidth={2} />
            <span>{m.label}</span>
            <kbd>{m.key}</kbd>
          </button>
        );
      })}
      {pending.criterionName && <span className="sel-hint">→ {pending.criterionName}</span>}
      <button type="button" className="sel-dismiss" onClick={onDismiss} title="Dismiss (Esc)">
        ×
      </button>
    </div>
  );
}

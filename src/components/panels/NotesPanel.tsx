import { useEffect, useMemo, useRef, useState } from 'react';
import { useFramework } from '../../hooks/useFramework';
import { Highlighter, Trash2, MapPin, ArrowDownUp } from 'lucide-react';
import { useStore } from '../../lib/store';
import type { Annotation, NoteKind } from '../../lib/types';
import { AutoTextarea, DictateButton, EmptyState, IconButton, KIND_META, KIND_ORDER, KindIcon, Segmented } from '../ui';
import { clip } from '../../lib/format';

export function NotesPanel() {
  const review = useStore((s) => s.review)!;
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const selectedNoteId = useStore((s) => s.selectedNoteId);
  const fw = useFramework(review.frameworkId);
  const [sort, setSort] = useState<'page' | 'recent'>('page');
  const listRef = useRef<HTMLDivElement>(null);

  const notes = useMemo(() => {
    const q = filter.query.toLowerCase();
    const docOrder = new Map(review.docs.map((d, i) => [d.id, i]));
    return review.annotations
      .filter((a) => filter.kinds.includes(a.kind))
      .filter((a) => !filter.criterionId || (filter.criterionId === 'none' ? !a.criterionId : a.criterionId === filter.criterionId))
      .filter((a) => !q || a.comment.toLowerCase().includes(q) || a.quote.toLowerCase().includes(q))
      .sort((a, b) => (sort === 'recent' ? b.createdAt - a.createdAt : (docOrder.get(a.docId) ?? 0) - (docOrder.get(b.docId) ?? 0) || a.page - b.page || a.createdAt - b.createdAt));
  }, [review.annotations, review.docs, filter, sort]);

  useEffect(() => {
    if (!selectedNoteId) return;
    const el = listRef.current?.querySelector(`[data-note="${selectedNoteId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedNoteId]);

  const counts = KIND_ORDER.map((k) => ({ k, n: review.annotations.filter((a) => a.kind === k).length }));

  if (review.annotations.length === 0) {
    return (
      <div className="notes">
        <EmptyState icon={Highlighter} title="No notes yet">
          Select a passage in the application, then press <kbd>S</kbd> for a strength, <kbd>W</kbd> for a weakness, <kbd>Q</kbd> for a question, or <kbd>N</kbd> for a note. Each becomes a bullet in your draft, with the page number.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="notes">
      <div className="notes-filters">
        <div className="kind-chips">
          {counts.map(({ k, n }) => {
            const on = filter.kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                className={`kind-chip kind-${k} ${on ? 'is-on' : ''}`}
                onClick={() => setFilter({ kinds: on ? filter.kinds.filter((x) => x !== k) : [...filter.kinds, k] })}
                title={`${on ? 'Hide' : 'Show'} ${KIND_META[k].plural.toLowerCase()}`}
              >
                <KindIcon kind={k} size={12} /> {n}
              </button>
            );
          })}
        </div>
        <select value={filter.criterionId ?? ''} onChange={(e) => setFilter({ criterionId: e.target.value || undefined })} aria-label="Filter by criterion">
          <option value="">All criteria</option>
          {fw.criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.short}
            </option>
          ))}
          <option value="none">Unassigned</option>
        </select>
        <IconButton icon={ArrowDownUp} label={sort === 'page' ? 'Sorted by page. Click for most recent.' : 'Sorted by recent. Click for page order.'} active={sort === 'recent'} onClick={() => setSort(sort === 'page' ? 'recent' : 'page')} />
      </div>
      <input className="notes-search" value={filter.query} onChange={(e) => setFilter({ query: e.target.value })} placeholder="Filter notes" aria-label="Filter notes" />
      <div className="notes-list" ref={listRef}>
        {notes.length === 0 && <p className="muted center">Nothing matches these filters.</p>}
        {notes.map((a) => (
          <NoteCard key={a.id} note={a} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: Annotation }) {
  const review = useStore((s) => s.review)!;
  const selected = useStore((s) => s.selectedNoteId === note.id);
  const editing = useStore((s) => s.editingNoteId === note.id);
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const deleteAnnotation = useStore((s) => s.deleteAnnotation);
  const fw = useFramework(review.frameworkId);
  const ta = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const multiDoc = review.docs.length > 1;
  const docName = review.docs.find((d) => d.id === note.docId)?.name ?? '';

  useEffect(() => {
    if (editing) {
      ta.current?.focus();
      const len = ta.current?.value.length ?? 0;
      ta.current?.setSelectionRange(len, len);
    }
  }, [editing]);

  const jump = () => useStore.getState().jumpTo({ docId: note.docId, page: note.page, rect: note.rects[0], flashNoteId: note.id });

  return (
    <article
      className={`note note-${note.kind} ${selected ? 'is-selected' : ''}`}
      data-note={note.id}
      onClick={() => {
        if (!selected) useStore.getState().selectNote(note.id);
      }}
    >
      <header className="note-head">
        <Segmented<NoteKind>
          size="s"
          ariaLabel="Note kind"
          value={note.kind}
          options={KIND_ORDER.map((k) => ({ value: k, label: <KindIcon kind={k} size={12} />, title: KIND_META[k].label, tone: k }))}
          onChange={(kind) => updateAnnotation(note.id, { kind, severity: kind === 'weakness' ? note.severity ?? 'minor' : undefined })}
        />
        <button type="button" className="chip chip-page" onClick={jump} title={multiDoc ? `${docName}, page ${note.page}` : `Go to page ${note.page}`}>
          <MapPin size={11} /> {multiDoc ? `${clip(docName.replace(/\.pdf$/i, ''), 14)} · ` : ''}p. {note.page}
        </button>
        <span className="grow" />
        {note.kind === 'weakness' && (
          <Segmented<'major' | 'minor'>
            size="s"
            ariaLabel="Severity"
            value={note.severity ?? 'minor'}
            options={[
              { value: 'major', label: 'Major', tone: 'weakness' },
              { value: 'minor', label: 'Minor' },
            ]}
            onChange={(severity) => updateAnnotation(note.id, { severity })}
          />
        )}
        {confirm ? (
          <span className="confirm-inline">
            <button type="button" className="btn btn-danger btn-xs" onClick={() => deleteAnnotation(note.id)}>
              Delete
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </span>
        ) : (
          <IconButton icon={Trash2} label="Delete note" size={14} onClick={() => setConfirm(true)} />
        )}
      </header>
      <blockquote className={`note-quote ${expanded ? 'is-expanded' : ''}`} onClick={() => setExpanded((v) => !v)} title="Click to expand">
        {note.quote}
      </blockquote>
      <AutoTextarea
        ref={ta}
        className="note-comment"
        minRows={1}
        value={note.comment}
        placeholder={
          note.kind === 'strength'
            ? 'Why is this a strength?'
            : note.kind === 'weakness'
              ? 'What is the problem, and what would fix it?'
              : note.kind === 'question'
                ? 'What do you need the applicants to clarify?'
                : 'Your note'
        }
        onChange={(e) => updateAnnotation(note.id, { comment: e.target.value })}
        onFocus={() => useStore.getState().editNote(note.id)}
        onBlur={() => useStore.getState().editNote(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
        }}
      />
      <footer className="note-foot">
        <DictateButton compact onText={(t) => updateAnnotation(note.id, { comment: note.comment ? `${note.comment.replace(/\s+$/, '')} ${t}` : t.charAt(0).toUpperCase() + t.slice(1) })} />
        <span className="grow" />
        <select value={note.criterionId ?? ''} onChange={(e) => updateAnnotation(note.id, { criterionId: e.target.value || undefined })} aria-label="Criterion" className={note.criterionId ? '' : 'is-empty'}>
          <option value="">Unassigned</option>
          {fw.criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.short}
            </option>
          ))}
        </select>
      </footer>
    </article>
  );
}

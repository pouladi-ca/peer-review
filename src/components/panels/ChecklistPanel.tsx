import { useMemo, useState } from 'react';
import { useFramework } from '../../hooks/useFramework';
import { Check, X, Minus, SearchX, MapPin } from 'lucide-react';
import { useStore } from '../../lib/store';
import { type ChecklistCategory, type ChecklistItemDef } from '../../lib/frameworks';
import { findEvidence } from '../../lib/analyze/checklist';
import type { CheckState, EvidenceHit } from '../../lib/types';

const CATEGORY_LABEL: Record<ChecklistCategory, string> = {
  science: 'Science',
  rigor: 'Rigor',
  feasibility: 'Feasibility',
  compliance: 'Compliance and policy',
  reviewer: 'My own checks',
};
const ORDER: ChecklistCategory[] = ['science', 'rigor', 'feasibility', 'compliance', 'reviewer'];

export function ChecklistPanel() {
  const review = useStore((s) => s.review)!;
  const docs = useStore((s) => s.docs);
  const fw = useFramework(review.frameworkId);

  const evidence = useMemo(() => {
    const out: Record<string, (EvidenceHit & { docId: string })[]> = {};
    for (const meta of review.docs) {
      const d = docs[meta.id];
      if (!d || d.status !== 'ready') continue;
      const ev = findEvidence(fw.checklist, d.pages);
      for (const [id, hits] of Object.entries(ev)) out[id] = [...(out[id] ?? []), ...hits.map((h) => ({ ...h, docId: meta.id }))];
    }
    return out;
  }, [docs, review.docs, fw]);

  const resolved = fw.checklist.filter((c) => (review.checklist[c.id]?.state ?? 'unset') !== 'unset').length;
  const groups = ORDER.map((cat) => ({ cat, items: fw.checklist.filter((c) => c.category === cat) })).filter((g) => g.items.length);

  return (
    <div className="checklist">
      <p className="panel-intro">
        {resolved} of {fw.checklist.length} resolved. Page references show where the text seems to address each item, so you can verify rather than hunt.
      </p>
      {groups.map((g) => (
        <section key={g.cat} className="card">
          <div className="card-title">{CATEGORY_LABEL[g.cat]}</div>
          <ul className="check-list">
            {g.items.map((item) => (
              <CheckItem key={item.id} item={item} hits={evidence[item.id] ?? []} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CheckItem({ item, hits }: { item: ChecklistItemDef; hits: (EvidenceHit & { docId: string })[] }) {
  const review = useStore((s) => s.review)!;
  const update = useStore((s) => s.update);
  const entry = review.checklist[item.id] ?? { state: 'unset' as CheckState, note: '' };
  const [noteOpen, setNoteOpen] = useState(!!entry.note);
  const multiDoc = review.docs.length > 1;

  const set = (patch: Partial<typeof entry>) =>
    update((r) => {
      r.checklist[item.id] = { ...(r.checklist[item.id] ?? { state: 'unset', note: '' }), ...patch };
    });
  const toggle = (s: CheckState) => set({ state: entry.state === s ? 'unset' : s });

  const pages = [...new Map(hits.map((h) => [`${h.docId}:${h.page}`, h])).values()].slice(0, 6);

  return (
    <li className={`check-item state-${entry.state}`}>
      <div className="check-row">
        <div className="check-tri" role="radiogroup" aria-label={item.label}>
          <button type="button" role="radio" aria-checked={entry.state === 'yes'} className="tri tri-yes" onClick={() => toggle('yes')} title="Yes">
            <Check size={13} />
          </button>
          <button type="button" role="radio" aria-checked={entry.state === 'no'} className="tri tri-no" onClick={() => toggle('no')} title="No">
            <X size={13} />
          </button>
          <button type="button" role="radio" aria-checked={entry.state === 'na'} className="tri tri-na" onClick={() => toggle('na')} title="Not applicable">
            <Minus size={13} />
          </button>
        </div>
        <div className="check-text">
          <div className="check-label">{item.label}</div>
          {item.hint && <div className="check-hint">{item.hint}</div>}
          {item.patterns && (
            <div className="check-evidence">
              {pages.length ? (
                <>
                  <span className="muted">Found</span>
                  {pages.map((h) => (
                    <button
                      key={`${h.docId}:${h.page}`}
                      type="button"
                      className="chip chip-page"
                      title={h.snippet}
                      onClick={() => useStore.getState().jumpTo({ docId: h.docId, page: h.page, rect: h.rect })}
                    >
                      <MapPin size={10} /> {multiDoc ? `${review.docs.find((d) => d.id === h.docId)?.name.slice(0, 10) ?? ''}… ` : ''}p. {h.page}
                    </button>
                  ))}
                </>
              ) : (
                <span className="muted not-found">
                  <SearchX size={12} /> Not detected in the text
                </span>
              )}
            </div>
          )}
          {noteOpen ? (
            <input className="check-note" value={entry.note} placeholder="Note for the draft" onChange={(e) => set({ note: e.target.value })} autoFocus={!entry.note} aria-label="Checklist note" />
          ) : (
            <button type="button" className="link small" onClick={() => setNoteOpen(true)}>
              Add note
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

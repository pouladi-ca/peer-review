import { BookOpen, Highlighter, Gauge, ListChecks, PenLine } from 'lucide-react';
import { useStore, type PanelTab } from '../../lib/store';
import { BriefPanel } from './BriefPanel';
import { NotesPanel } from './NotesPanel';
import { ScorePanel } from './ScorePanel';
import { ChecklistPanel } from './ChecklistPanel';
import { DraftPanel } from './DraftPanel';

const TABS: { id: PanelTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'brief', label: 'Brief', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: Highlighter },
  { id: 'score', label: 'Score', icon: Gauge },
  { id: 'checklist', label: 'Checklist', icon: ListChecks },
  { id: 'draft', label: 'Draft', icon: PenLine },
];

export function Panel() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const noteCount = useStore((s) => s.review?.annotations.length ?? 0);
  return (
    <aside className="panel">
      <div className="panel-tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`panel-tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)} title={`${t.label} (${i + 1})`}>
            <t.icon size={15} strokeWidth={1.9} />
            <span>{t.label}</span>
            {t.id === 'notes' && noteCount > 0 && <span className="count">{noteCount}</span>}
          </button>
        ))}
      </div>
      <div className="panel-body" key={tab}>
        {tab === 'brief' && <BriefPanel />}
        {tab === 'notes' && <NotesPanel />}
        {tab === 'score' && <ScorePanel />}
        {tab === 'checklist' && <ChecklistPanel />}
        {tab === 'draft' && <DraftPanel />}
      </div>
    </aside>
  );
}

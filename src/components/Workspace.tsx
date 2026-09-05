import { BookOpen, Highlighter, Gauge, ListChecks, PenLine, List } from 'lucide-react';
import { useStore, type PanelTab } from '../lib/store';
import { useIsPhone } from '../hooks/useMedia';
import { TopBar } from './TopBar';
import { Navigator } from './Navigator';
import { PdfViewer } from './viewer/PdfViewer';
import { ReadView } from './reader/ReadView';
import { Panel } from './panels/Panel';
import { Sheet } from './Sheet';

const TABS: { id: PanelTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'brief', label: 'Brief', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: Highlighter },
  { id: 'score', label: 'Score', icon: Gauge },
  { id: 'checklist', label: 'Checks', icon: ListChecks },
  { id: 'draft', label: 'Draft', icon: PenLine },
];

export function Workspace() {
  const focusMode = useStore((s) => s.focusMode);
  const navOpen = useStore((s) => s.navOpen);
  const isPhone = useIsPhone();
  const viewMode = useStore((s) => s.viewMode);
  const Viewer = viewMode === 'read' ? ReadView : PdfViewer;

  if (isPhone) return <PhoneWorkspace Viewer={Viewer} />;
  return (
    <div className={`ws ${focusMode ? 'is-focus' : ''} ${navOpen ? '' : 'nav-closed'}`}>
      <TopBar />
      <div className="ws-body">
        {!focusMode && navOpen && <Navigator />}
        <Viewer />
        {!focusMode && <Panel />}
      </div>
    </div>
  );
}

/** Phones: the document fills the screen; panels open as bottom sheets from a tab bar. */
function PhoneWorkspace({ Viewer }: { Viewer: () => React.JSX.Element }) {
  const sheet = useStore((s) => s.sheet);
  const tab = useStore((s) => s.tab);
  const noteCount = useStore((s) => s.review?.annotations.length ?? 0);
  const setSheet = useStore((s) => s.setSheet);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className="ws is-phone is-focus">
      <TopBar />
      <div className="ws-body">
        <Viewer />
      </div>
      <nav className="tabbar" aria-label="Review panels">
        <button type="button" className={`tabbar-btn ${sheet === 'nav' ? 'is-on' : ''}`} onClick={() => setSheet(sheet === 'nav' ? null : 'nav')}>
          <List size={18} strokeWidth={1.9} />
          <span>Contents</span>
        </button>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tabbar-btn ${sheet === 'panel' && tab === t.id ? 'is-on' : ''}`}
            onClick={() => {
              setTab(t.id);
              setSheet(sheet === 'panel' && tab === t.id ? null : 'panel');
            }}
          >
            <t.icon size={18} strokeWidth={1.9} />
            <span>{t.label}</span>
            {t.id === 'notes' && noteCount > 0 && <span className="tabbar-count">{noteCount}</span>}
          </button>
        ))}
      </nav>
      {sheet === 'nav' && (
        <Sheet title="Contents" onClose={() => setSheet(null)}>
          <Navigator />
        </Sheet>
      )}
      {sheet === 'panel' && (
        <Sheet onClose={() => setSheet(null)} tall>
          <Panel />
        </Sheet>
      )}
    </div>
  );
}

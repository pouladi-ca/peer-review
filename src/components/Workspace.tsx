import { BookOpen, Highlighter, Gauge, ListChecks, PenLine, List, Loader2, UploadCloud, ScanText } from 'lucide-react';
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
      <ImportStrip />
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
      <ImportStrip />
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

/**
 * A slim strip under the top bar while a PDF is still being read or uploaded, so
 * a long import on a phone never looks stuck: page counts for extraction, a
 * percentage for the upload, and a bar for each.
 */
function ImportStrip() {
  const activeDocId = useStore((s) => s.activeDocId);
  const doc = useStore((s) => (activeDocId ? s.docs[activeDocId] : undefined));
  const transfers = useStore((s) => s.transfers);
  const reviewDocs = useStore((s) => s.review?.docs);
  const uploads = (reviewDocs ?? []).map((d) => transfers[d.id]).filter((t): t is { name: string; fraction: number } => !!t);
  const reading = doc?.status === 'loading';
  if (!reading && uploads.length === 0) return null;
  const items: { key: string; icon: React.ReactNode; label: string; fraction: number }[] = [];
  if (reading) {
    const total = doc.pdf?.numPages ?? 0;
    const done = Math.max(1, Math.round(doc.progress * total));
    items.push({ key: 'read', icon: <ScanText size={13} />, label: total ? `Reading page ${done} of ${total}` : 'Opening the PDF', fraction: doc.progress });
  }
  for (const [i, u] of uploads.entries()) {
    items.push({ key: `up-${i}`, icon: <UploadCloud size={13} />, label: `Uploading${uploads.length > 1 ? ` ${u.name}` : ''} ${Math.round(u.fraction * 100)}%`, fraction: u.fraction });
  }
  return (
    <div className="import-strip" role="status" aria-live="polite">
      <Loader2 size={13} className="spin" />
      {items.map((it) => (
        <span key={it.key} className="import-item" title={it.key === 'read' ? 'Extracting text for the outline, search, and checklist. You can read meanwhile.' : 'Sending the PDF to your server so other devices and the reading view can use it.'}>
          {it.icon}
          <span className="import-label">{it.label}</span>
          <span className="import-bar">
            <span style={{ width: `${Math.round(it.fraction * 100)}%` }} />
          </span>
        </span>
      ))}
    </div>
  );
}

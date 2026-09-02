import { useStore } from '../lib/store';
import { TopBar } from './TopBar';
import { Navigator } from './Navigator';
import { PdfViewer } from './viewer/PdfViewer';
import { Panel } from './panels/Panel';

export function Workspace() {
  const focusMode = useStore((s) => s.focusMode);
  const navOpen = useStore((s) => s.navOpen);
  return (
    <div className={`ws ${focusMode ? 'is-focus' : ''} ${navOpen ? '' : 'nav-closed'}`}>
      <TopBar />
      <div className="ws-body">
        {!focusMode && navOpen && <Navigator />}
        <PdfViewer />
        {!focusMode && <Panel />}
      </div>
    </div>
  );
}

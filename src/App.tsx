import { useEffect } from 'react';
import { useStore } from './lib/store';
import { useActiveTimer, useGlobalShortcuts, useUnloadGuard } from './hooks/useGlobal';
import { Library } from './components/Library';
import { Login } from './components/Login';
import { Workspace } from './components/Workspace';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { Toast, BusyOverlay } from './components/Overlays';
import { Celebrate } from './components/Celebrate';
import { FrameworkEditor } from './components/FrameworkEditor';
import { FigureViewerHost } from './components/reader/FigureViewer';

export default function App() {
  const booted = useStore((s) => s.booted);
  const authed = useStore((s) => s.authed);
  const hasReview = useStore((s) => s.review !== null);
  useEffect(() => {
    useStore.getState().boot();
  }, []);
  useGlobalShortcuts();
  useActiveTimer();
  useUnloadGuard();

  if (authed === null) return <div className="boot" />;
  if (authed === false) return <Login />;
  if (!booted) return <div className="boot" />;
  return (
    <>
      {hasReview ? <Workspace /> : <Library />}
      <CommandPalette />
      <ShortcutsHelp />
      <FrameworkEditor />
      <FigureViewerHost />
      <BusyOverlay />
      <Celebrate />
      <Toast />
    </>
  );
}

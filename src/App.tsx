import { useEffect } from 'react';
import { useStore } from './lib/store';
import { useActiveTimer, useGlobalShortcuts, useUnloadGuard } from './hooks/useGlobal';
import { Library } from './components/Library';
import { Workspace } from './components/Workspace';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { Toast, BusyOverlay } from './components/Overlays';

export default function App() {
  const booted = useStore((s) => s.booted);
  const hasReview = useStore((s) => s.review !== null);
  useEffect(() => {
    useStore.getState().boot();
  }, []);
  useGlobalShortcuts();
  useActiveTimer();
  useUnloadGuard();

  if (!booted) return <div className="boot" />;
  return (
    <>
      {hasReview ? <Workspace /> : <Library />}
      <CommandPalette />
      <ShortcutsHelp />
      <BusyOverlay />
      <Toast />
    </>
  );
}

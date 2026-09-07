import { useEffect } from 'react';
import { useStore } from './lib/store';
import { useActiveTimer, useGlobalShortcuts, useUnloadGuard } from './hooks/useGlobal';
import { useLaunchIntent } from './hooks/useLaunchIntent';
import { Library } from './components/Library';
import { Login } from './components/Login';
import { Workspace } from './components/Workspace';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { Toast, BusyOverlay } from './components/Overlays';
import { Celebrate } from './components/Celebrate';
import { FrameworkEditor } from './components/FrameworkEditor';
import { AdminPage } from './components/AdminPage';
import { MeetingView } from './components/MeetingView';
import { InboxDialog } from './components/InboxDialog';
import { SecurityDialog } from './components/SecurityDialog';
import { ChangePassword, PasswordDialogHost } from './components/ChangePassword';
import { FigureViewerHost } from './components/reader/FigureViewer';

export default function App() {
  const booted = useStore((s) => s.booted);
  const authed = useStore((s) => s.authed);
  const mustChange = useStore((s) => s.me?.mustChangePassword ?? false);
  const hasReview = useStore((s) => s.review !== null);
  useEffect(() => {
    useStore.getState().boot();
  }, []);
  useGlobalShortcuts();
  useActiveTimer();
  useUnloadGuard();
  useLaunchIntent(authed === true && booted && !mustChange);

  if (authed === null) return <div className="boot" />;
  if (authed === false) return <Login />;
  if (mustChange)
    return (
      <>
        <ChangePassword forced />
        <Toast />
      </>
    );
  if (!booted) return <div className="boot" />;
  return (
    <>
      {hasReview ? <Workspace /> : <Library />}
      <CommandPalette />
      <ShortcutsHelp />
      <FrameworkEditor />
      <AdminPage />
      <PasswordDialogHost />
      <MeetingView />
      <InboxDialog />
      <SecurityDialog />
      <FigureViewerHost />
      <BusyOverlay />
      <Celebrate />
      <Toast />
    </>
  );
}

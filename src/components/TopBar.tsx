import { useMemo, useState } from 'react';
import { useFramework } from '../hooks/useFramework';
import { FrameworkOptions } from './FrameworkOptions';
import { ArrowLeft, Sun, Moon, Monitor, Command, Keyboard, Scan, Clock, Check, Loader2, Cloud, CloudOff, RefreshCw, LogOut, MoreHorizontal, SlidersHorizontal, KeyRound, Users, Send, Fingerprint } from 'lucide-react';
import { useStore } from '../lib/store';

import { computeProgress } from '../lib/progress';
import { formatDuration, mod } from '../lib/format';
import { IconButton, ProgressRing, Wordmark, Kbd } from './ui';

export function TopBar() {
  const review = useStore((s) => s.review)!;
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const focusMode = useStore((s) => s.focusMode);
  const saveState = useStore((s) => s.saveState);
  const sync = useStore((s) => s.sync);
  const isAdmin = useStore((s) => s.me?.isAdmin ?? false);
  const update = useStore((s) => s.update);
  const [showProgress, setShowProgress] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const fw = useFramework(review.frameworkId);
  const progress = useMemo(() => computeProgress(review, fw), [review, fw]);

  const cycleTheme = () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="btn btn-ghost btn-s back-btn" onClick={() => useStore.getState().closeReview()} title="Back to your reviews">
          <ArrowLeft size={15} /> <span>Library</span>
        </button>
        <Wordmark size="s" />
        <input
          className="title-input"
          value={review.title}
          onChange={(e) =>
            update((r) => {
              r.title = e.target.value;
            })
          }
          onBlur={(e) => {
            if (!e.target.value.trim())
              update((r) => {
                r.title = 'Untitled review';
              });
          }}
          aria-label="Review title"
          spellCheck={false}
        />
      </div>
      <div className="topbar-right">
        <label className="field-inline topbar-fw" title={fw.blurb}>
          <select
            value={review.frameworkId}
            onChange={(e) => {
              if (e.target.value === '__manage') useStore.getState().openFrameworkEditor();
              else useStore.getState().setFramework(e.target.value);
            }}
            aria-label="Review framework"
          >
            <FrameworkOptions keepId={review.frameworkId} />
            <option value="__manage">Manage frameworks…</option>
          </select>
        </label>
        <span className="chip chip-quiet" title="Active time on this review">
          <Clock size={13} /> {formatDuration(review.activeMs)}
        </span>
        <span className={`save-state save-${saveState}`} aria-live="polite">
          {saveState === 'saving' ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
          {saveState === 'saving' ? 'Saving' : 'Saved'}
        </span>
        <button
          type="button"
          className={`sync-state sync-${sync.state} btn btn-ghost btn-s`}
          onClick={() => useStore.getState().syncNow()}
          title={sync.message ?? (sync.pending ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync` : sync.lastSync ? `Synced ${new Date(sync.lastSync).toLocaleTimeString()}` : 'Sync now')}
        >
          {sync.state === 'syncing' ? <RefreshCw size={13} className="spin" /> : sync.state === 'offline' || sync.state === 'error' ? <CloudOff size={13} /> : <Cloud size={13} />}
          <span>{sync.state === 'syncing' ? 'Syncing' : sync.state === 'offline' ? `Offline${sync.pending ? ` · ${sync.pending}` : ''}` : sync.state === 'error' ? 'Sync error' : sync.pending ? `${sync.pending} pending` : 'Synced'}</span>
        </button>
        <div className="progress-wrap" onMouseEnter={() => setShowProgress(true)} onMouseLeave={() => setShowProgress(false)}>
          <button type="button" className="progress-btn" onClick={() => setShowProgress((v) => !v)} aria-label="Review progress">
            <ProgressRing value={progress.percent} size={30} stroke={3.5} />
            <span className="progress-pct">{progress.percent}%</span>
          </button>
          {showProgress && (
            <div className="popover progress-pop">
              <div className="popover-title">Review progress</div>
              <ul>
                {progress.parts.map((p) => (
                  <li key={p.id} className={p.done >= p.total ? 'is-done' : ''}>
                    <span>{p.label}</span>
                    <span className="mono">
                      {p.done}/{p.total}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="popover-foot">Next: {progress.nextStep}</div>
            </div>
          )}
        </div>
        <IconButton icon={ThemeIcon} label={`Theme: ${theme}`} onClick={cycleTheme} />
        <IconButton icon={Scan} label="Focus mode (F)" active={focusMode} onClick={() => useStore.getState().toggleFocus()} />
        <IconButton icon={Keyboard} label="Keyboard shortcuts (?)" onClick={() => useStore.getState().setHelp(true)} />
        <IconButton icon={LogOut} label="Sign out" onClick={() => useStore.getState().signOut()} />
        <button type="button" className="btn btn-ghost btn-s palette-btn" onClick={() => useStore.getState().setPalette(true)} title="Command palette">
          <Command size={14} /> <Kbd>{mod} K</Kbd>
        </button>
        <div className="more-wrap">
          <IconButton icon={MoreHorizontal} label="More" active={showMore} onClick={() => setShowMore((v) => !v)} />
          {showMore && (
            <>
              <div className="more-scrim" onClick={() => setShowMore(false)} />
              <div className="popover more-pop" role="menu">
                <label className="more-item more-select">
                  <SlidersHorizontal size={14} />
                  <select
                    value={review.frameworkId}
                    onChange={(e) => {
                      if (e.target.value === '__manage') useStore.getState().openFrameworkEditor();
                      else useStore.getState().setFramework(e.target.value);
                      setShowMore(false);
                    }}
                    aria-label="Review framework"
                  >
                    <FrameworkOptions keepId={review.frameworkId} />
                    <option value="__manage">Manage frameworks…</option>
                  </select>
                </label>
                <button type="button" className="more-item" role="menuitem" onClick={() => (cycleTheme(), setShowMore(false))}>
                  <ThemeIcon size={14} /> Theme: {theme}
                </button>
                <button type="button" className="more-item" role="menuitem" onClick={() => (useStore.getState().syncNow(), setShowMore(false))}>
                  <RefreshCw size={14} /> Sync now
                </button>
                <button type="button" className="more-item" role="menuitem" onClick={() => (useStore.getState().openInbox(), setShowMore(false))}>
                  <Send size={14} /> Send PDFs from your phone
                </button>
                <button type="button" className="more-item" role="menuitem" onClick={() => (useStore.getState().openSecurity(), setShowMore(false))}>
                  <Fingerprint size={14} /> Passkeys and devices
                </button>
                <button type="button" className="more-item" role="menuitem" onClick={() => (useStore.getState().openPasswordDialog(), setShowMore(false))}>
                  <KeyRound size={14} /> Change password
                </button>
                {isAdmin && (
                  <button type="button" className="more-item" role="menuitem" onClick={() => (useStore.getState().openAdmin(), setShowMore(false))}>
                    <Users size={14} /> Manage people
                  </button>
                )}
                <button type="button" className="more-item is-danger" role="menuitem" onClick={() => useStore.getState().signOut()}>
                  <LogOut size={14} /> Sign out of this device
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

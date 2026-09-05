import { useMemo, useState } from 'react';
import { useAllFrameworks, useFramework } from '../hooks/useFramework';
import { ArrowLeft, Sun, Moon, Monitor, Command, Keyboard, Scan, Clock, Check, Loader2, Cloud, CloudOff, RefreshCw, LogOut } from 'lucide-react';
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
  const update = useStore((s) => s.update);
  const [showProgress, setShowProgress] = useState(false);
  const fw = useFramework(review.frameworkId);
  const frameworks = useAllFrameworks();
  const progress = useMemo(() => computeProgress(review, fw), [review, fw]);

  const cycleTheme = () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="btn btn-ghost btn-s" onClick={() => useStore.getState().closeReview()} title="Back to your reviews">
          <ArrowLeft size={15} /> Library
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
            <optgroup label="Built in">
              {frameworks.filter((f) => !f.custom).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
            {frameworks.some((f) => f.custom) && (
              <optgroup label="Yours">
                {frameworks.filter((f) => f.custom).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            )}
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
          {sync.state === 'syncing' ? 'Syncing' : sync.state === 'offline' ? `Offline${sync.pending ? ` · ${sync.pending}` : ''}` : sync.state === 'error' ? 'Sync error' : sync.pending ? `${sync.pending} pending` : 'Synced'}
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
      </div>
    </header>
  );
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { Wordmark } from './ui';

const MIN = 10;

/**
 * Choose a new password. `forced` is the first sign-in after an invitation or an admin
 * reset: the whole screen, nothing else reachable until it is done. Otherwise a dialog
 * from the account menu.
 */
export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const me = useStore((s) => s.me);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  const close = () => useStore.getState().closePasswordDialog();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (next !== confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      const updated = await api.changePassword(current, next);
      const s = useStore.getState();
      s.setMe(updated);
      s.notify('Password changed. Other devices will need to sign in again.', 'success');
      if (!forced) close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className="pw-form" onSubmit={submit}>
      <label className="pw-field">
        <span>{forced ? 'Temporary password' : 'Current password'}</span>
        <input ref={first} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" aria-label={forced ? 'Temporary password' : 'Current password'} />
      </label>
      <label className="pw-field">
        <span>New password</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-label="New password" />
      </label>
      <label className="pw-field">
        <span>New password again</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" aria-label="New password again" />
      </label>
      <p className="muted small">At least {MIN} characters. A sentence you will remember beats a short scramble.</p>
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      <div className="pw-actions">
        {!forced && (
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !current || !next || !confirm}>
          {busy ? 'Saving…' : forced ? 'Set password and continue' : 'Change password'}
        </button>
      </div>
    </form>
  );

  if (forced) {
    return (
      <div className="login">
        <div className="login-card pw-card">
          <Wordmark size="l" />
          <h2 className="pw-title">Choose a new password</h2>
          <p className="login-lead">
            You signed in as <strong>{me?.email}</strong> with a temporary password. Pick your own to continue.
          </p>
          {form}
          <button type="button" className="link pw-signout" onClick={() => useStore.getState().signOut()}>
            Not you? Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal pw-dialog" role="dialog" aria-label="Change password" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>
              <KeyRound size={16} /> Change password
            </h2>
            <p>Signed in as {me?.email}. Every other device is signed out once you change it.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="pw-body">{form}</div>
      </div>
    </div>
  );
}

/** Mounted once; shows the dialog when the account menu asks for it. */
export function PasswordDialogHost() {
  const open = useStore((s) => s.passwordDialogOpen);
  if (!open) return null;
  return <ChangePassword />;
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { Wordmark } from './ui';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      setPassword('');
      await useStore.getState().signedIn();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not reach the server.';
      setError(msg);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      input.current?.focus();
      input.current?.select();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className={`login-card ${shake ? 'is-shake' : ''}`} onSubmit={submit}>
        <Wordmark size="l" />
        <p className="login-lead">Your reviews, on every device. Sign in to continue.</p>
        <label className="login-field">
          <Lock size={15} />
          <input ref={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" aria-label="Password" />
        </label>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-primary login-btn" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="login-foot">Applications are confidential. Panelist keeps them on your own password-protected server.</p>
      </form>
    </div>
  );
}

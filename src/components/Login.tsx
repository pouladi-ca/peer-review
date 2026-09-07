import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Fingerprint, Lock, Mail } from 'lucide-react';
import { passkeysSupported, signWithPasskey } from '../lib/webauthn';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { Wordmark } from './ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const canPasskey = passkeysSupported();
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailInput.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await api.login(email.trim(), password);
      setPassword('');
      await useStore.getState().signedIn(me);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not reach the server.';
      setError(msg);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      passwordInput.current?.focus();
      passwordInput.current?.select();
    } finally {
      setBusy(false);
    }
  };

  const withPasskey = async () => {
    if (passkeyBusy) return;
    setPasskeyBusy(true);
    setError(null);
    try {
      const { challengeId, options } = await api.passkeys.loginOptions(email.trim());
      const credential = await signWithPasskey(options);
      const me = await api.passkeys.login(challengeId, credential);
      await useStore.getState().signedIn(me);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return; // the person cancelled
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not reach the server.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  return (
    <div className="login">
      <form className={`login-card ${shake ? 'is-shake' : ''}`} onSubmit={submit}>
        <Wordmark size="l" />
        <p className="login-lead">Your reviews, on every device. Sign in to continue.</p>
        <label className="login-field">
          <Mail size={15} />
          <input ref={emailInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} aria-label="Email" />
        </label>
        <label className="login-field">
          <Lock size={15} />
          <input ref={passwordInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" aria-label="Password" />
        </label>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-primary login-btn" disabled={busy || !password || !email}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {canPasskey && (
          <button type="button" className="btn login-btn login-passkey" onClick={withPasskey} disabled={passkeyBusy}>
            <Fingerprint size={15} /> {passkeyBusy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
          </button>
        )}
        <p className="login-foot">Applications are confidential. Each reviewer sees only their own, and nothing leaves this server.</p>
      </form>
    </div>
  );
}

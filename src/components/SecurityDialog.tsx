import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, LogOut, Plus, Smartphone, Trash2, X } from 'lucide-react';
import { api, ApiError, type PasskeyInfo, type SessionInfo } from '../lib/api';
import { useStore } from '../lib/store';
import { formatRelative } from '../lib/format';
import { createPasskey, passkeysSupported } from '../lib/webauthn';

/** Passkeys for this account and every device signed in to it. */
export function SecurityDialog() {
  const open = useStore((s) => s.securityOpen);
  if (!open) return null;
  return <Security />;
}

function Security() {
  const notify = useStore((s) => s.notify);
  const close = () => useStore.getState().closeSecurity();
  const [keys, setKeys] = useState<PasskeyInfo[] | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const supported = passkeysSupported();

  const load = useCallback(async () => {
    try {
      const [k, s] = await Promise.all([api.passkeys.list(), api.sessions.list()]);
      setKeys(k.passkeys);
      setSessions(s.sessions);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not reach the server.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load]);

  const addPasskey = async () => {
    setBusy(true);
    try {
      const { challengeId, options } = await api.passkeys.registerOptions();
      const credential = await createPasskey(options);
      await api.passkeys.register(challengeId, credential, label);
      setLabel('');
      notify('Passkey added. You can sign in on this device with it from now on.', 'success');
      await load();
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return;
      notify(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not create the passkey.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const removePasskey = async (k: PasskeyInfo) => {
    if (!window.confirm(`Remove the passkey “${k.label}”? The device keeps a copy that will no longer work here.`)) return;
    await api.passkeys.remove(k.id).catch((e) => notify(e instanceof ApiError ? e.message : 'Could not remove it.', 'error'));
    await load();
  };
  const endSession = async (s: SessionInfo) => {
    await api.sessions.end(s.id).catch((e) => notify(e instanceof ApiError ? e.message : 'Could not sign that device out.', 'error'));
    if (s.current) {
      await useStore.getState().signOut();
      return;
    }
    notify(`Signed out ${s.label}.`, 'success');
    await load();
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal security" role="dialog" aria-label="Passkeys and devices" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>
              <Fingerprint size={16} /> Passkeys and devices
            </h2>
            <p>A passkey signs you in with Face ID, Touch ID, or your device's own lock, with no password to type.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="security-body">
          <section>
            <h3>Passkeys</h3>
            {!supported && <p className="muted">This browser cannot create passkeys. Add one from a phone or a recent desktop browser.</p>}
            {supported && (
              <div className="security-add">
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this device (optional)" aria-label="Passkey name" maxLength={60} />
                <button type="button" className="btn btn-primary" onClick={addPasskey} disabled={busy}>
                  <Plus size={14} /> Add a passkey for this device
                </button>
              </div>
            )}
            {keys === null ? (
              <p className="muted">Loading…</p>
            ) : keys.length === 0 ? (
              <p className="muted">No passkeys yet.</p>
            ) : (
              <ul className="security-list" aria-label="Passkeys">
                {keys.map((k) => (
                  <li key={k.id}>
                    <Fingerprint size={15} />
                    <div>
                      <div className="security-label">{k.label}</div>
                      <div className="muted small">
                        Added {formatRelative(k.createdAt)}
                        {k.lastUsedAt ? ` · last used ${formatRelative(k.lastUsedAt)}` : ''}
                      </div>
                    </div>
                    <button type="button" className="btn btn-s" onClick={() => removePasskey(k)} aria-label={`Remove passkey ${k.label}`}>
                      <Trash2 size={13} /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Signed-in devices</h3>
            {sessions === null ? (
              <p className="muted">Loading…</p>
            ) : (
              <ul className="security-list" aria-label="Signed-in devices">
                {sessions.map((s) => (
                  <li key={s.id} className={s.current ? 'is-current' : ''}>
                    <Smartphone size={15} />
                    <div>
                      <div className="security-label">
                        {s.label}
                        {s.current && <span className="chip chip-quiet">this device</span>}
                      </div>
                      <div className="muted small">
                        Signed in {formatRelative(s.createdAt)} · active {formatRelative(s.lastSeenAt)}
                      </div>
                    </div>
                    <button type="button" className="btn btn-s" onClick={() => endSession(s)} aria-label={`Sign out ${s.label}`}>
                      <LogOut size={13} /> Sign out
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

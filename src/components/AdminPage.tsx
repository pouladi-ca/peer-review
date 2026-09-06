import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, Plus, ShieldCheck, ShieldOff, Trash2, UserRoundX, UserRoundCheck, Users, X } from 'lucide-react';
import { api, ApiError, type AdminUser } from '../lib/api';
import { useStore } from '../lib/store';
import { copyText } from '../lib/export/download';
import { formatRelative } from '../lib/format';

/** Admin-only: invite reviewers, reset their passwords, disable, promote, or delete them. */
export function AdminPage() {
  const open = useStore((s) => s.adminOpen);
  if (!open) return null;
  return <AdminDialog />;
}

function AdminDialog() {
  const me = useStore((s) => s.me);
  const notify = useStore((s) => s.notify);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ email: string; password: string; reset: boolean } | null>(null);

  const close = () => useStore.getState().closeAdmin();

  const load = useCallback(async () => {
    try {
      setUsers((await api.admin.users()).users);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const invite = (e: FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    void run('create', async () => {
      const r = await api.admin.create(target, asAdmin);
      setReveal({ email: r.user.email, password: r.temporaryPassword, reset: false });
      setEmail('');
      setAsAdmin(false);
    });
  };

  const reset = (u: AdminUser) =>
    run(`reset-${u.id}`, async () => {
      const r = await api.admin.reset(u.id);
      setReveal({ email: r.user.email, password: r.temporaryPassword, reset: true });
    });

  const toggleDisabled = (u: AdminUser) => run(`dis-${u.id}`, async () => void (await api.admin.update(u.id, { disabled: !u.disabled })));
  const toggleAdmin = (u: AdminUser) => run(`adm-${u.id}`, async () => void (await api.admin.update(u.id, { isAdmin: !u.isAdmin })));
  const remove = (u: AdminUser) => {
    if (!window.confirm(`Delete ${u.email} and every review, note, and PDF they own? This cannot be undone.`)) return;
    void run(`del-${u.id}`, async () => {
      const r = await api.admin.remove(u.id);
      notify(`Removed ${u.email} and ${r.reviewsRemoved} review${r.reviewsRemoved === 1 ? '' : 's'}.`, 'success');
    });
  };

  const copyTemp = async () => {
    if (!reveal) return;
    const ok = await copyText(reveal.password);
    notify(ok ? 'Temporary password copied.' : 'Copy failed.', ok ? 'success' : 'error');
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal admin" role="dialog" aria-label="People" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>
              <Users size={16} /> People
            </h2>
            <p>Each person sees only their own reviews. New accounts get a temporary password to change at first sign-in.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="admin-body">
          <form className="admin-invite" onSubmit={invite}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="reviewer@university.edu" aria-label="Email of the person to add" autoCapitalize="none" spellCheck={false} />
            <label className="switch">
              <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
              <span>Admin</span>
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy === 'create' || !email.trim()}>
              <Plus size={14} /> Add person
            </button>
          </form>

          {reveal && (
            <div className="temp-pass" role="status">
              <div>
                <strong>{reveal.reset ? 'New temporary password' : 'Temporary password'} for {reveal.email}</strong>
                <p>Hand it over in person or by a channel you trust. It works once: they must choose their own password when they sign in{reveal.reset ? ', and every device they were signed in on has been signed out' : ''}.</p>
              </div>
              <code className="temp-pass-code">{reveal.password}</code>
              <div className="temp-pass-actions">
                <button type="button" className="btn btn-s" onClick={copyTemp}>
                  <Copy size={13} /> Copy
                </button>
                <button type="button" className="btn btn-s btn-ghost" onClick={() => setReveal(null)}>
                  Done
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="callout callout-warn" role="alert">
              {error}
            </div>
          )}

          {users === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.id === me?.id;
                    return (
                      <tr key={u.id} className={u.disabled ? 'is-disabled' : ''}>
                        <td className="admin-email">
                          {u.email}
                          {self && <span className="chip chip-quiet">you</span>}
                        </td>
                        <td>{u.isAdmin ? 'Admin' : 'Reviewer'}</td>
                        <td>{u.disabled ? 'Disabled' : u.mustChangePassword ? 'Temporary password' : 'Active'}</td>
                        <td className="muted">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'}</td>
                        <td className="admin-actions">
                          <button type="button" className="btn btn-s" onClick={() => reset(u)} disabled={busy !== null} title="Issue a new temporary password and sign them out everywhere">
                            <KeyRound size={13} /> Reset password
                          </button>
                          {!self && (
                            <>
                              <button type="button" className="btn btn-s" onClick={() => toggleDisabled(u)} disabled={busy !== null} title={u.disabled ? 'Let them sign in again' : 'Block sign-in and end their sessions; keeps their data'}>
                                {u.disabled ? <UserRoundCheck size={13} /> : <UserRoundX size={13} />} {u.disabled ? 'Enable' : 'Disable'}
                              </button>
                              <button type="button" className="btn btn-s" onClick={() => toggleAdmin(u)} disabled={busy !== null} title={u.isAdmin ? 'Remove admin rights' : 'Let them manage people too'}>
                                {u.isAdmin ? <ShieldOff size={13} /> : <ShieldCheck size={13} />} {u.isAdmin ? 'Remove admin' : 'Make admin'}
                              </button>
                              <button type="button" className="btn btn-s is-danger" onClick={() => remove(u)} disabled={busy !== null} title="Delete the account and everything it owns">
                                <Trash2 size={13} /> Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

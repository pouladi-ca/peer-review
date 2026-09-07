import { useEffect, useState } from 'react';
import { Copy, KeyRound, Send, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { copyText } from '../lib/export/download';

/** "Send PDFs from your phone": the share target on Android and desktop, an iOS Shortcut with an inbox token on iPhone. */
export function InboxDialog() {
  const open = useStore((s) => s.inboxOpen);
  if (!open) return null;
  return <Inbox />;
}

function Inbox() {
  const notify = useStore((s) => s.notify);
  const close = () => useStore.getState().closeInbox();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = window.location.origin;

  useEffect(() => {
    api.inbox
      .status()
      .then((r) => setConfigured(r.configured))
      .catch(() => setConfigured(false));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.inbox.create();
      setToken(r.token);
      setConfigured(true);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await api.inbox.revoke();
      setToken(null);
      setConfigured(false);
      notify('Inbox token revoked. Shortcuts using it will stop working.', 'success');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, what: string) => {
    const ok = await copyText(text);
    notify(ok ? `${what} copied.` : 'Copy failed.', ok ? 'success' : 'error');
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal inbox" role="dialog" aria-label="Send PDFs from your phone" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>
              <Send size={16} /> Send PDFs from your phone
            </h2>
            <p>A proposal shared from Mail or Files becomes a new review here, without downloading and re-uploading.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="inbox-body">
          <section>
            <h3>Android, ChromeOS, Windows</h3>
            <p>
              Install Panelist from the browser menu (“Install app” or “Add to Home screen”). Panelist then appears in the share sheet for PDFs; sharing one opens it here as a new review.
            </p>
          </section>
          <section>
            <h3>iPhone and iPad</h3>
            <p>Safari does not let web apps join the share sheet, so a one-time Shortcut does it. It posts the PDF to your inbox with a private token.</p>
            <div className="inbox-token">
              {token ? (
                <>
                  <div>
                    <strong>Your inbox token</strong>
                    <p>Shown once. Paste it into the Shortcut below, then close this.</p>
                  </div>
                  <code className="temp-pass-code">{token}</code>
                  <div className="temp-pass-actions">
                    <button type="button" className="btn btn-s" onClick={() => copy(`Bearer ${token}`, 'Authorization header value')}>
                      <Copy size={13} /> Copy “Bearer …”
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <strong>{configured ? 'An inbox token is set up' : 'No inbox token yet'}</strong>
                    <p>{configured ? 'Create a new one if you lost it; the old one stops working.' : 'Create one to use in the Shortcut.'}</p>
                  </div>
                  <div className="temp-pass-actions">
                    <button type="button" className="btn btn-s btn-primary" onClick={create} disabled={busy || configured === null}>
                      <KeyRound size={13} /> {configured ? 'Create a new token' : 'Create token'}
                    </button>
                    {configured && (
                      <button type="button" className="btn btn-s is-danger" onClick={revoke} disabled={busy}>
                        <Trash2 size={13} /> Revoke
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <ol className="inbox-steps">
              <li>
                Open the <strong>Shortcuts</strong> app, tap <strong>+</strong>, and name it “Send to Panelist”. Tap the ⓘ button and turn on <strong>Show in Share Sheet</strong>; under Share Sheet Types keep <strong>PDFs</strong> and <strong>Files</strong>.
              </li>
              <li>
                Add the action <strong>Get Contents of URL</strong>. URL: <code>{origin}/api/inbox?name=</code> followed by the variable <em>Shortcut Input › Name</em>. Method <strong>POST</strong>. Under Headers add <code>Authorization</code> with the value copied above. Request Body: <strong>File</strong> → <em>Shortcut Input</em>.
                <button type="button" className="link" onClick={() => copy(`${origin}/api/inbox?name=`, 'URL')}>
                  <Copy size={11} /> Copy URL
                </button>
              </li>
              <li>
                Add <strong>Get Dictionary Value</strong> for key <code>url</code> from <em>Contents of URL</em>, then <strong>Open URLs</strong>. Sharing a PDF now creates the review and opens it in Panelist.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

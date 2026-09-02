import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useStore } from '../lib/store';

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info;
  return (
    <div className={`toast toast-${toast.kind}`} role="status" key={toast.id}>
      <Icon size={16} />
      <span>{toast.text}</span>
    </div>
  );
}

export function BusyOverlay() {
  const busy = useStore((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy" role="alert" aria-busy>
      <div className="busy-card">
        <div className="spinner" />
        <div>{busy}</div>
      </div>
    </div>
  );
}

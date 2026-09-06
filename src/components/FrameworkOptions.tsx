import { useFrameworkMenu } from '../hooks/useFramework';

/**
 * The <option>s of a framework <select>, arranged by the reviewer's preferences: pinned
 * agencies first, then the rest, then their own; hidden ones are left out unless
 * `keepId` names one. The caller adds any leading choice ("Detect from the PDF") and the
 * trailing "Manage frameworks…" entry.
 */
export function FrameworkOptions({ keepId }: { keepId?: string }) {
  const { pinned, others, hiddenCount } = useFrameworkMenu(keepId);
  const builtIn = others.filter((f) => !f.custom);
  const custom = others.filter((f) => f.custom);
  const opt = (f: { id: string; name: string }) => (
    <option key={f.id} value={f.id}>
      {f.name}
    </option>
  );
  return (
    <>
      {pinned.length > 0 && <optgroup label="Pinned">{pinned.map(opt)}</optgroup>}
      {builtIn.length > 0 && <optgroup label={pinned.length ? 'Other agencies' : 'Built in'}>{builtIn.map(opt)}</optgroup>}
      {custom.length > 0 && <optgroup label="Yours">{custom.map(opt)}</optgroup>}
      {hiddenCount > 0 && (
        <option value="__manage" disabled>
          {hiddenCount} hidden
        </option>
      )}
    </>
  );
}

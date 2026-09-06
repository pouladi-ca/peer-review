import { allFrameworks, arrangeFrameworks, getFramework, type Framework } from '../lib/frameworks';
import { useStore } from '../lib/store';

/** Resolve a framework by id, re-rendering when custom frameworks change. */
export function useFramework(id: string): Framework {
  useStore((s) => s.frameworksVersion);
  return getFramework(id);
}

/** Built-in plus reviewer-defined frameworks, kept current. */
export function useAllFrameworks(): Framework[] {
  useStore((s) => s.frameworksVersion);
  return allFrameworks();
}

/** The frameworks as this reviewer wants them in a menu: pinned first, hidden ones gone, `keepId` always present. */
export function useFrameworkMenu(keepId?: string): { pinned: Framework[]; others: Framework[]; hiddenCount: number } {
  const all = useAllFrameworks();
  const prefs = useStore((s) => s.frameworkPrefs);
  return arrangeFrameworks(all, prefs, keepId);
}

import { allFrameworks, getFramework, type Framework } from '../lib/frameworks';
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

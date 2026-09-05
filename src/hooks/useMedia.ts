import { useEffect, useState } from 'react';

/** Reactive matchMedia. Safe when matchMedia is missing (tests, old engines). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Phone-sized screens, where the navigator and review panel become bottom sheets. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 719px)');
}

/** A device whose primary input is a finger: the selection toolbar docks at the bottom. */
export function isTouchLike(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  return 'ontouchstart' in window && navigator.maxTouchPoints > 0;
}

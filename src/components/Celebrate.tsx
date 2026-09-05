import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { getFramework } from '../lib/frameworks';
import { computeProgress } from '../lib/progress';

const COLORS = ['#2e7d4f', '#2c6b70', '#b26f14', '#4a6aa5', '#c2413f', '#7cc4c6'];

/** A brief, tasteful confetti burst the first time a review reaches 100%. */
export function Celebrate() {
  const review = useStore((s) => s.review);
  const fwVersion = useStore((s) => s.frameworksVersion);
  const percent = useMemo(() => (review ? computeProgress(review, getFramework(review.frameworkId)).percent : 0), [review, fwVersion]);
  const [show, setShow] = useState(false);
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!review) {
      firedFor.current = null;
      return;
    }
    if (percent >= 100 && firedFor.current !== review.id) {
      firedFor.current = review.id;
      setShow(true);
      useStore.getState().notify('Review complete. Nicely done.', 'success');
      const t = setTimeout(() => setShow(false), 2800);
      return () => clearTimeout(t);
    }
    if (percent < 100 && firedFor.current === review.id) firedFor.current = null;
  }, [percent, review]);

  if (!show) return null;
  return (
    <div className="celebrate" aria-hidden>
      {Array.from({ length: 90 }).map((_, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              left: `${Math.random() * 100}%`,
              background: COLORS[i % COLORS.length],
              '--delay': `${Math.random() * 0.5}s`,
              '--dur': `${2.2 + Math.random() * 1.4}s`,
              transform: `scale(${0.7 + Math.random() * 0.8})`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

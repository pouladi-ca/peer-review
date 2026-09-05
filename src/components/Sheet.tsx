import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A bottom sheet for phones. Fixed, so opening it never moves the document's scroll
 * position; closes on the scrim, the ✕, Escape, or a downward swipe on the grip.
 */
export function Sheet({ title, onClose, children, tall }: { title?: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        className={`sheet ${tall ? 'is-tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTouchStart={(e) => {
          if ((e.target as HTMLElement).closest('.sheet-grip, .sheet-head')) startY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (startY.current !== null && e.changedTouches[0].clientY - startY.current > 60) onClose();
          startY.current = null;
        }}
      >
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-head">
            <div className="sheet-title">{title}</div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

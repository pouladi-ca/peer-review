import { FileText, BookOpenText } from 'lucide-react';
import { useStore } from '../../lib/store';

/** Pages (the PDF as laid out) or Read (reflowed text, phone-friendly). */
export function ViewModeToggle() {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  return (
    <div className="seg seg-s view-toggle" role="radiogroup" aria-label="View">
      <button type="button" role="radio" aria-checked={viewMode === 'pages'} className={`seg-btn ${viewMode === 'pages' ? 'is-on' : ''}`} onClick={() => setViewMode('pages')} title="Pages: the PDF as laid out">
        <FileText size={13} /> <span>Pages</span>
      </button>
      <button type="button" role="radio" aria-checked={viewMode === 'read'} className={`seg-btn ${viewMode === 'read' ? 'is-on' : ''}`} onClick={() => setViewMode('read')} title="Read: reflowed text with figure cards">
        <BookOpenText size={13} /> <span>Read</span>
      </button>
    </div>
  );
}

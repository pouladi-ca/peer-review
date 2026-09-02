import { X } from 'lucide-react';
import { useStore } from '../lib/store';
import { Kbd } from './ui';
import { mod } from '../lib/format';

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Tagging',
    rows: [
      ['S', 'Tag the selected passage as a strength'],
      ['W', 'Tag as a weakness'],
      ['Q', 'Tag as a question for the applicants'],
      ['N', 'Keep as a note'],
      ['Esc', 'Dismiss the selection toolbar, or finish editing'],
      ['Enter', 'Finish a note comment (Shift+Enter for a new line)'],
    ],
  },
  {
    title: 'Reading',
    rows: [
      ['[  ]', 'Previous or next page'],
      ['+  -', 'Zoom in or out'],
      [`${mod} F`, 'Find in document'],
      ['\\', 'Show or hide the navigator'],
      ['F', 'Focus mode'],
    ],
  },
  {
    title: 'Panels',
    rows: [
      ['1 2 3 4 5', 'Brief, Notes, Score, Checklist, Draft'],
      [`${mod} K`, 'Command palette'],
      ['?', 'This help'],
    ],
  },
];

export function ShortcutsHelp() {
  const open = useStore((s) => s.helpOpen);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => useStore.getState().setHelp(false)}>
      <div className="modal help" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => useStore.getState().setHelp(false)}>
            <X size={16} />
          </button>
        </header>
        <div className="help-grid">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map(([k, d]) => (
                  <div key={k}>
                    <dt>
                      {k.split(/\s{2}/).map((part) => (
                        <Kbd key={part}>{part}</Kbd>
                      ))}
                    </dt>
                    <dd>{d}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

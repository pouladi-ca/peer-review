import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { useStore, selectActiveDoc, type PanelTab } from '../lib/store';
import { getFramework } from '../lib/frameworks';
import { composeDraft, draftToMarkdown } from '../lib/draft';
import { copyText, downloadBlob, downloadText, safeFilename } from '../lib/export/download';
import { draftToDocx } from '../lib/export/docx';

interface Cmd {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const review = useStore((s) => s.review);
  const doc = useStore(selectActiveDoc);
  const fwVersion = useStore((s) => s.frameworksVersion);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const cmds = useMemo<Cmd[]>(() => {
    const s = useStore.getState();
    const close = () => s.setPalette(false);
    const list: Cmd[] = [];
    if (review) {
      const fw = getFramework(review.frameworkId);
      const tabs: [PanelTab, string][] = [
        ['brief', 'Brief'],
        ['notes', 'Notes'],
        ['score', 'Score'],
        ['checklist', 'Checklist'],
        ['draft', 'Draft'],
      ];
      tabs.forEach(([id, label], i) => list.push({ id: `tab-${id}`, label: `Open ${label}`, group: 'Panels', hint: String(i + 1), run: () => (s.setTab(id), close()) }));
      list.push({ id: 'focus', label: s.focusMode ? 'Leave focus mode' : 'Focus mode: hide panels', group: 'View', hint: 'F', run: () => (s.toggleFocus(), close()) });
      list.push({ id: 'nav', label: s.navOpen ? 'Hide navigator' : 'Show navigator', group: 'View', hint: '\\', run: () => (s.toggleNav(), close()) });
      list.push({ id: 'fit-width', label: 'Fit page width', group: 'View', run: () => (s.setFitMode('width'), close()) });
      list.push({ id: 'fit-page', label: 'Fit whole page in window', group: 'View', run: () => (s.setFitMode('page'), close()) });
      list.push({ id: 'search', label: 'Find in document', group: 'View', hint: '⌘F', run: () => (s.setNavTab('search'), close(), setTimeout(() => document.querySelector<HTMLInputElement>('.nav-search input')?.focus(), 50)) });
      for (const c of fw.criteria.filter((c) => c.group === 'core')) {
        list.push({
          id: `focus-${c.id}`,
          label: `${review.focusCriterionId === c.id ? 'Unfocus' : 'Focus'} criterion: ${c.short}`,
          group: 'Criteria',
          run: () => {
            s.update((r) => {
              r.focusCriterionId = r.focusCriterionId === c.id ? undefined : c.id;
            });
            s.setTab('score');
            close();
            setTimeout(() => document.getElementById(`crit-${c.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
          },
        });
      }
      if (doc?.status === 'ready') {
        for (const o of doc.outline) list.push({ id: `sec-${o.id}`, label: o.title, group: 'Go to section', hint: `p. ${o.page}`, run: () => (s.jumpTo({ docId: doc.id, page: o.page, rect: { x: 0, y: o.y, w: 1, h: 0.02 } }), close()) });
      }
      const base = safeFilename(review.title);
      list.push({
        id: 'exp-docx',
        label: 'Export review as Word',
        group: 'Export',
        run: async () => {
          close();
          downloadBlob(await draftToDocx(composeDraft(review, fw)), `${base}-review.docx`);
          s.notify('Word document downloaded.', 'success');
        },
      });
      list.push({ id: 'exp-md', label: 'Export review as Markdown', group: 'Export', run: () => (close(), downloadText(draftToMarkdown(composeDraft(review, fw)), `${base}-review.md`, 'text/markdown')) });
      list.push({
        id: 'exp-copy',
        label: 'Copy review to clipboard',
        group: 'Export',
        run: async () => {
          close();
          const ok = await copyText(draftToMarkdown(composeDraft(review, fw)));
          s.notify(ok ? 'Copied.' : 'Copy failed.', ok ? 'success' : 'error');
        },
      });
      list.push({ id: 'library', label: 'Back to library', group: 'Navigate', run: () => (close(), s.closeReview()) });
    }
    list.push({ id: 'theme-light', label: 'Theme: light', group: 'Appearance', run: () => (s.setTheme('light'), close()) });
    list.push({ id: 'theme-dark', label: 'Theme: dark', group: 'Appearance', run: () => (s.setTheme('dark'), close()) });
    list.push({ id: 'theme-system', label: 'Theme: follow system', group: 'Appearance', run: () => (s.setTheme('system'), close()) });
    list.push({ id: 'frameworks', label: 'Manage review frameworks', group: 'Help', run: () => (close(), s.openFrameworkEditor()) });
    list.push({ id: 'sync', label: 'Sync now', group: 'Account', run: () => (close(), void s.syncNow()) });
    list.push({ id: 'signout', label: 'Sign out of this device', group: 'Account', run: () => (close(), void s.signOut()) });
    list.push({ id: 'signout-all', label: 'Sign out everywhere', group: 'Account', run: () => (close(), void s.signOut(true)) });
    list.push({ id: 'help', label: 'Keyboard shortcuts', group: 'Help', hint: '?', run: () => (close(), s.setHelp(true)) });
    return list;
  }, [review, doc, open, fwVersion]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return cmds;
    const words = t.split(/\s+/);
    return cmds.filter((c) => words.every((w) => (c.label + ' ' + c.group).toLowerCase().includes(w)));
  }, [cmds, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);
  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  if (!open) return null;

  let lastGroup = '';
  return (
    <div className="modal-backdrop" onMouseDown={() => useStore.getState().setPalette(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or section name"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setIdx((i) => Math.min(filtered.length - 1, i + 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setIdx((i) => Math.max(0, i - 1)));
              if (e.key === 'Enter') filtered[idx]?.run();
            }}
          />
        </div>
        <ul className="palette-list" ref={listRef}>
          {filtered.length === 0 && <li className="palette-empty">No matching commands</li>}
          {filtered.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {showGroup && <div className="palette-group">{c.group}</div>}
                <button type="button" className={`palette-item ${i === idx ? 'is-active' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => c.run()}>
                  <span>{c.label}</span>
                  {c.hint && <kbd className="kbd">{c.hint}</kbd>}
                  {i === idx && <CornerDownLeft size={13} className="palette-enter" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { List, Search, LayoutGrid, Plus, X, FileText } from 'lucide-react';
import { useStore, selectActiveDoc } from '../lib/store';
import { searchPages } from '../lib/analyze/search';
import { sectionAt } from '../lib/analyze/outline';
import { plural } from '../lib/format';
import { EmptyState, IconButton, KIND_ORDER } from './ui';
import type { DocRole } from '../lib/types';

export function Navigator() {
  const navTab = useStore((s) => s.navTab);
  const setNavTab = useStore((s) => s.setNavTab);
  const review = useStore((s) => s.review)!;
  const activeDocId = useStore((s) => s.activeDocId);
  const doc = useStore(selectActiveDoc);
  const fileInput = useRef<HTMLInputElement>(null);
  const [addRole, setAddRole] = useState<DocRole>('supporting');

  return (
    <aside className="nav">
      <div className="nav-docs">
        {review.docs.length > 1 ? (
          <select value={activeDocId ?? ''} onChange={(e) => useStore.getState().setActiveDoc(e.target.value)} aria-label="Document">
            {review.docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.role === 'application' ? '★ ' : ''}
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="nav-docname" title={review.docs[0]?.name}>
            <FileText size={13} /> {review.docs[0]?.name}
          </span>
        )}
        <div className="nav-add">
          <select value={addRole} onChange={(e) => setAddRole(e.target.value as DocRole)} aria-label="Role for the next document" title="Role for the document you add next">
            <option value="supporting">Supporting</option>
            <option value="guidance">Reviewer guidance</option>
            <option value="application">Application</option>
          </select>
          <IconButton icon={Plus} label="Add a document" onClick={() => fileInput.current?.click()} />
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) useStore.getState().addDocument(f, addRole);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="nav-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={navTab === 'outline'} className={navTab === 'outline' ? 'is-on' : ''} onClick={() => setNavTab('outline')}>
          <List size={14} /> Outline
        </button>
        <button type="button" role="tab" aria-selected={navTab === 'search'} className={navTab === 'search' ? 'is-on' : ''} onClick={() => setNavTab('search')}>
          <Search size={14} /> Search
        </button>
        <button type="button" role="tab" aria-selected={navTab === 'pages'} className={navTab === 'pages' ? 'is-on' : ''} onClick={() => setNavTab('pages')}>
          <LayoutGrid size={14} /> Pages
        </button>
      </div>
      <div className="nav-body">
        {!doc || doc.status !== 'ready' ? (
          <div className="nav-loading">{doc?.status === 'error' ? doc.error : 'Reading the document…'}</div>
        ) : navTab === 'outline' ? (
          <OutlineList />
        ) : navTab === 'search' ? (
          <SearchList />
        ) : (
          <PageMap />
        )}
      </div>
    </aside>
  );
}

function OutlineList() {
  const doc = useStore(selectActiveDoc)!;
  const page = useStore((s) => s.page);
  const current = useMemo(() => sectionAt(doc.outline, page, 1), [doc.outline, page]);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector('.is-current');
    el?.scrollIntoView({ block: 'nearest' });
  }, [current?.id]);

  if (!doc.outline.length) {
    return (
      <EmptyState icon={List} title="No headings detected">
        The Pages tab still lets you move around, and search works on every page.
      </EmptyState>
    );
  }
  return (
    <ul className="outline" ref={listRef}>
      {doc.outline.map((e) => (
        <li key={e.id} className={`outline-item lvl-${e.level} ${current?.id === e.id ? 'is-current' : ''}`}>
          <button type="button" onClick={() => useStore.getState().jumpTo({ docId: doc.id, page: e.page, rect: { x: 0, y: e.y, w: 1, h: 0.02 } })}>
            <span className="outline-title">{e.title}</span>
            <span className="outline-page">{e.page}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchList() {
  const doc = useStore(selectActiveDoc)!;
  const query = useStore((s) => s.searchQuery);
  const setSearch = useStore((s) => s.setSearch);
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchPages(doc.id, doc.pages, query), [doc, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setActive(0), [query]);

  const go = (i: number) => {
    const h = hits[i];
    if (!h) return;
    setActive(i);
    useStore.getState().jumpTo({ docId: h.docId, page: h.page, rect: h.rect });
  };

  return (
    <div className="nav-search">
      <div className="search-box">
        <Search size={14} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find in document"
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(e.shiftKey ? Math.max(0, active - 1) : Math.min(hits.length - 1, active + (hits.length && query ? 1 : 0)));
            if (e.key === 'Escape') setSearch('');
          }}
        />
        {query && <IconButton icon={X} label="Clear search" size={14} onClick={() => setSearch('')} />}
      </div>
      {query.length >= 2 && <div className="search-count">{hits.length === 0 ? 'No matches' : `${plural(hits.length, 'match', 'matches')}${hits.length >= 200 ? ' (showing first 200)' : ''}`}</div>}
      <ul className="search-results">
        {hits.map((h, i) => (
          <li key={i} className={i === active ? 'is-current' : ''}>
            <button type="button" onClick={() => go(i)}>
              <span className="search-page">p. {h.page}</span>
              <span className="search-snippet">{h.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PageMap() {
  const doc = useStore(selectActiveDoc)!;
  const review = useStore((s) => s.review)!;
  const page = useStore((s) => s.page);
  const visited = new Set(review.visited[doc.id] ?? []);
  const counts = useMemo(() => {
    const m = new Map<number, Record<string, number>>();
    for (const a of review.annotations) {
      if (a.docId !== doc.id) continue;
      const c = m.get(a.page) ?? {};
      c[a.kind] = (c[a.kind] ?? 0) + 1;
      m.set(a.page, c);
    }
    return m;
  }, [review.annotations, doc.id]);
  const total = doc.pages.length;
  return (
    <div className="pagemap">
      <div className="pagemap-legend">
        {visited.size} of {total} pages read
      </div>
      <div className="pagemap-grid">
        {doc.pages.map((p) => {
          const c = counts.get(p.page);
          return (
            <button
              key={p.page}
              type="button"
              className={`pagemap-tile ${visited.has(p.page) ? 'is-visited' : ''} ${page === p.page ? 'is-current' : ''}`}
              onClick={() => useStore.getState().jumpTo({ docId: doc.id, page: p.page })}
              title={`Page ${p.page}${c ? ': ' + Object.entries(c).map(([k, n]) => `${n} ${k}`).join(', ') : ''}`}
            >
              <span>{p.page}</span>
              {c && (
                <span className="pagemap-dots">
                  {KIND_ORDER.filter((k) => c[k]).map((k) => (
                    <i key={k} className={`dot dot-${k}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

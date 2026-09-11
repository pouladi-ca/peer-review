import { useEffect, useMemo, useRef, useState } from 'react';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Download, Upload, Copy, Sparkles, Star, Eye, EyeOff, CircleDot, Circle } from 'lucide-react';
import { useAllFrameworks } from '../hooks/useFramework';
import { useStore } from '../lib/store';
import { FRAMEWORKS, frameworkToCustomDef, getFramework, type CustomFrameworkDef, type ScaleDef } from '../lib/frameworks';
import { downloadText, safeFilename } from '../lib/export/download';
import { AutoTextarea } from './ui';

type CriterionDef = CustomFrameworkDef['criteria'][number];

const FIVE: ScaleDef = { kind: 'numeric', min: 1, max: 5, bestIsLow: false, labels: { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' }, hint: '5 is best.' };

function blankDef(): CustomFrameworkDef {
  const now = Date.now();
  const crit = (name: string, description: string): CriterionDef => ({ id: 'c' + nanoid(5), name, short: name, description, prompts: [], group: 'core' });
  return {
    id: 'custom-' + nanoid(6),
    name: 'My framework',
    agency: 'Custom',
    blurb: '',
    criteria: [
      crit('Significance', 'Importance of the problem and potential impact of the results.'),
      crit('Approach', 'Soundness of the design, methods, and analysis plan.'),
      crit('Feasibility', 'Likelihood the work can be completed as proposed by this team.'),
    ],
    criterionScale: FIVE,
    overall: { label: 'Overall score', description: 'Your overall assessment of the proposal.', scale: FIVE },
    recommendations: ['Fund', 'Fund with revisions', 'Do not fund'],
    guidance: [],
    createdAt: now,
    updatedAt: now,
  };
}

const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);

function validate(d: CustomFrameworkDef): string | null {
  if (!d.name.trim()) return 'Give the framework a name.';
  if (!d.criteria.length) return 'Add at least one criterion.';
  for (const c of d.criteria) if (!c.name.trim()) return 'Every criterion needs a name.';
  const check = (s: ScaleDef, where: string): string | null => {
    if (s.kind === 'numeric') return s.min < s.max ? null : `${where}: the minimum must be below the maximum.`;
    return s.options.length >= 2 ? null : `${where}: give at least two options, one per line.`;
  };
  const e1 = check(d.criterionScale, 'Default scale');
  if (e1) return e1;
  const e2 = check(d.overall.scale, 'Overall scale');
  if (e2) return e2;
  for (const c of d.criteria) {
    if (c.scale) {
      const e = check(c.scale, c.name);
      if (e) return e;
    }
  }
  return null;
}

function parseImport(json: string): CustomFrameworkDef {
  const raw = JSON.parse(json) as Partial<CustomFrameworkDef>;
  if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.criteria)) throw new Error('Not a Panelist framework file.');
  const def: CustomFrameworkDef = { ...blankDef(), ...raw, id: 'custom-' + nanoid(6), createdAt: Date.now(), updatedAt: Date.now() };
  def.criteria = def.criteria.map((c) => ({ ...c, id: c.id || 'c' + nanoid(5), prompts: c.prompts ?? [], group: c.group ?? 'core', short: c.short || c.name }));
  const err = validate(def);
  if (err) throw new Error(err);
  return def;
}

/** Editor for numeric or categorical scales. */
function ScaleEditor({ value, onChange, allowInherit, inheritLabel }: { value: ScaleDef | undefined; onChange: (s: ScaleDef | undefined) => void; allowInherit?: boolean; inheritLabel?: string }) {
  const mode = value === undefined ? 'inherit' : value.kind;
  const setMode = (m: string) => {
    if (m === 'inherit') onChange(undefined);
    else if (m === 'numeric') onChange({ kind: 'numeric', min: 1, max: 5, bestIsLow: false, hint: '5 is best.' });
    else onChange({ kind: 'categorical', options: [{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }] });
  };
  const [optText, setOptText] = useState(value?.kind === 'categorical' ? value.options.map((o) => o.label).join('\n') : '');
  const [labelText, setLabelText] = useState(value?.kind === 'numeric' && value.labels ? Object.entries(value.labels).map(([k, v]) => `${k} = ${v}`).join('\n') : '');
  useEffect(() => {
    if (value?.kind === 'categorical') setOptText(value.options.map((o) => o.label).join('\n'));
    if (value?.kind === 'numeric') setLabelText(value.labels ? Object.entries(value.labels).map(([k, v]) => `${k} = ${v}`).join('\n') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="scale-editor">
      <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Scale type">
        {allowInherit && <option value="inherit">{inheritLabel ?? 'Use the default scale'}</option>}
        <option value="numeric">Numeric</option>
        <option value="categorical">Categories</option>
      </select>
      {value?.kind === 'numeric' && (
        <div className="scale-numeric">
          <label>
            Min <input type="number" value={value.min} onChange={(e) => onChange({ ...value, min: Number(e.target.value) })} />
          </label>
          <label>
            Max <input type="number" value={value.max} onChange={(e) => onChange({ ...value, max: Number(e.target.value) })} />
          </label>
          <label>
            Step <input type="number" step="0.1" min="0.1" value={value.step ?? 1} onChange={(e) => onChange({ ...value, step: Number(e.target.value) || 1 })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={value.bestIsLow} onChange={(e) => onChange({ ...value, bestIsLow: e.target.checked, hint: `${e.target.checked ? value.min : value.max} is best.` })} /> Lower is better
          </label>
          <textarea
            className="ta small-ta"
            rows={2}
            placeholder={'Optional labels, one per line, e.g.\n5 = Excellent\n1 = Poor'}
            value={labelText}
            onChange={(e) => {
              setLabelText(e.target.value);
              const labels: Record<number, string> = {};
              for (const l of lines(e.target.value)) {
                const m = l.match(/^\s*(-?\d+(?:\.\d+)?)\s*[=:\-–]\s*(.+)$/);
                if (m) labels[Number(m[1])] = m[2].trim();
              }
              onChange({ ...value, labels: Object.keys(labels).length ? labels : undefined });
            }}
          />
        </div>
      )}
      {value?.kind === 'categorical' && (
        <textarea
          className="ta small-ta"
          rows={4}
          placeholder={'One option per line, best first, e.g.\nExcellent\nVery good\nGood\nPoor'}
          value={optText}
          onChange={(e) => {
            setOptText(e.target.value);
            const opts = lines(e.target.value).map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || nanoid(4), label }));
            onChange({ kind: 'categorical', options: opts });
          }}
        />
      )}
    </div>
  );
}

export function FrameworkEditor() {
  const open = useStore((s) => s.frameworkEditor.open);
  const editId = useStore((s) => s.frameworkEditor.id);
  const defs = useStore((s) => s.customFrameworks);
  const notify = useStore((s) => s.notify);
  const [draft, setDraft] = useState<CustomFrameworkDef | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloneFrom, setCloneFrom] = useState('generic');
  const importInput = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const existing = editId ? defs.find((d) => d.id === editId) : undefined;
    setDraft(existing ? structuredClone(existing) : defs.length ? structuredClone(defs[0]) : null);
    setDirty(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const edit = (fn: (d: CustomFrameworkDef) => void) => {
    setDraft((d) => (d ? produce(d, fn) : d));
    setDirty(true);
  };

  const templates = useMemo(() => FRAMEWORKS.map((f) => ({ id: f.id, name: f.name })), []);

  if (!open) return null;

  const startBlank = () => {
    setDraft(blankDef());
    setDirty(true);
    setError(null);
  };
  const startClone = () => {
    const fw = getFramework(cloneFrom);
    setDraft(frameworkToCustomDef(fw, 'custom-' + nanoid(6)));
    setDirty(true);
    setError(null);
    mainRef.current?.scrollTo({ top: 0 });
  };
  const save = async () => {
    if (!draft) return;
    const err = validate(draft);
    if (err) {
      setError(err);
      return;
    }
    await useStore.getState().saveCustomFramework(draft);
    setDirty(false);
    setError(null);
    notify(`Saved “${draft.name}”.`, 'success');
  };
  const remove = async () => {
    if (!draft) return;
    if (await useStore.getState().deleteCustomFramework(draft.id)) {
      setDraft(null);
      notify('Framework deleted.', 'info');
    }
  };
  const exportJson = () => {
    if (!draft) return;
    downloadText(JSON.stringify(draft, null, 2), `${safeFilename(draft.name)}.framework.json`, 'application/json');
  };
  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setDraft(parseImport(await file.text()));
      setDirty(true);
      setError(null);
      notify('Framework imported. Save it to keep it.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Import failed.', 'error');
    }
  };
  const close = () => {
    if (dirty && !window.confirm('Discard unsaved changes to this framework?')) return;
    useStore.getState().closeFrameworkEditor();
  };

  const isSaved = !!draft && defs.some((d) => d.id === draft.id);

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal fw-editor" role="dialog" aria-label="Review frameworks" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Review frameworks</h2>
            <p className="muted small">Define the criteria and scales for any agency. Your frameworks and menu settings are part of your account and follow you to every device; export JSON to share one with a co-reviewer.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="fw-body">
          <aside className="fw-side">
            <div className="fw-side-title">Your frameworks</div>
            {defs.length === 0 && <p className="muted small">None yet. Start from a built-in rubric or a blank one.</p>}
            <ul className="fw-list">
              {defs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`fw-item ${draft?.id === d.id ? 'is-on' : ''}`}
                    onClick={() => {
                      if (dirty && !window.confirm('Discard unsaved changes?')) return;
                      setDraft(structuredClone(d));
                      setDirty(false);
                      setError(null);
                    }}
                  >
                    <span>{d.name}</span>
                    <span className="muted small">{d.criteria.length} criteria</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="fw-side-title">Create</div>
            <div className="fw-create">
              <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)} aria-label="Template">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-s" onClick={startClone}>
                <Copy size={13} /> Duplicate and edit
              </button>
              <button type="button" className="btn btn-ghost btn-s" onClick={startBlank}>
                <Sparkles size={13} /> Start blank
              </button>
              <button type="button" className="btn btn-ghost btn-s" onClick={() => importInput.current?.click()}>
                <Upload size={13} /> Import JSON
              </button>
              <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
            </div>
            <MenuPrefs />
          </aside>

          <div className="fw-main" ref={mainRef}>
            {!draft ? (
              <div className="empty">
                <div className="empty-title">Pick a framework to edit, or create one</div>
                <div className="empty-body">Duplicating a built-in rubric is the fastest way to match an agency that is not listed: rename the criteria, adjust the scale, and save.</div>
              </div>
            ) : (
              <form
                className="fw-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <div className="fw-grid">
                  <label>
                    Name
                    <input value={draft.name} onChange={(e) => edit((d) => void (d.name = e.target.value))} required />
                  </label>
                  <label>
                    Agency
                    <input value={draft.agency} onChange={(e) => edit((d) => void (d.agency = e.target.value))} placeholder="e.g. Heart and Stroke Foundation" />
                  </label>
                </div>
                <label>
                  Description
                  <input value={draft.blurb} onChange={(e) => edit((d) => void (d.blurb = e.target.value))} placeholder="One line on how this agency scores" />
                </label>

                <section className="fw-section">
                  <div className="fw-section-head">
                    <h3>Default criterion scale</h3>
                    <span className="muted small">Used by every criterion unless it sets its own.</span>
                  </div>
                  <ScaleEditor value={draft.criterionScale} onChange={(s) => edit((d) => void (d.criterionScale = s ?? FIVE))} />
                </section>

                <section className="fw-section">
                  <div className="fw-section-head">
                    <h3>Criteria</h3>
                    <button type="button" className="btn btn-s" onClick={() => edit((d) => void d.criteria.push({ id: 'c' + nanoid(5), name: 'New criterion', short: 'New criterion', description: '', prompts: [], group: 'core' }))}>
                      <Plus size={13} /> Add criterion
                    </button>
                  </div>
                  {draft.criteria.map((c, i) => (
                    <div key={c.id} className="fw-crit">
                      <div className="fw-crit-head">
                        <span className="fw-crit-n">{i + 1}</span>
                        <input className="fw-crit-name" value={c.name} onChange={(e) => edit((d) => void (d.criteria[i].name = e.target.value))} placeholder="Criterion name" aria-label="Criterion name" />
                        <select value={c.group} onChange={(e) => edit((d) => void (d.criteria[i].group = e.target.value as CriterionDef['group']))} aria-label="Criterion group" title="Core criteria get scores, bullets, and a place in the scorecard. Additional criteria are rated briefly.">
                          <option value="core">Core</option>
                          <option value="additional">Additional</option>
                        </select>
                        <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => edit((d) => void d.criteria.splice(i - 1, 0, d.criteria.splice(i, 1)[0]))}>
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" className="icon-btn" aria-label="Move down" disabled={i === draft.criteria.length - 1} onClick={() => edit((d) => void d.criteria.splice(i + 1, 0, d.criteria.splice(i, 1)[0]))}>
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" className="icon-btn" aria-label="Remove criterion" onClick={() => edit((d) => void d.criteria.splice(i, 1))}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="fw-grid">
                        <label>
                          Short label
                          <input value={c.short} onChange={(e) => edit((d) => void (d.criteria[i].short = e.target.value))} placeholder="Shown in chips and menus" />
                        </label>
                        <label>
                          Scale
                          <ScaleEditor value={c.scale} onChange={(s) => edit((d) => void (d.criteria[i].scale = s))} allowInherit inheritLabel="Default scale" />
                        </label>
                        <label className="fw-check">
                          <input type="checkbox" checked={!!c.unscored} onChange={(e) => edit((d) => void (d.criteria[i].unscored = e.target.checked || undefined))} />
                          Comments only, no score
                        </label>
                        <label>
                          Character limit
                          <input type="number" min={0} step={100} value={c.maxChars ?? ''} placeholder="None" onChange={(e) => edit((d) => void (d.criteria[i].maxChars = e.target.value ? Math.max(0, Number(e.target.value)) || undefined : undefined))} aria-label="Character limit" />
                        </label>
                        <label>
                          Word limit
                          <input type="number" min={0} step={50} value={c.maxWords ?? ''} placeholder="None" onChange={(e) => edit((d) => void (d.criteria[i].maxWords = e.target.value ? Math.max(0, Number(e.target.value)) || undefined : undefined))} aria-label="Word limit" />
                        </label>
                      </div>
                      <label>
                        What it asks
                        <AutoTextarea minRows={1} value={c.description} onChange={(e) => edit((d) => void (d.criteria[i].description = e.target.value))} placeholder="One or two sentences describing the criterion" />
                      </label>
                      <label>
                        Guiding questions, one per line
                        <AutoTextarea minRows={2} value={c.prompts.join('\n')} onChange={(e) => edit((d) => void (d.criteria[i].prompts = e.target.value.split('\n')))} placeholder={'Is the question important?\nAre the methods appropriate?'} />
                      </label>
                    </div>
                  ))}
                </section>

                <section className="fw-section">
                  <div className="fw-section-head">
                    <h3>Overall rating</h3>
                  </div>
                  <div className="fw-grid">
                    <label>
                      Label
                      <input value={draft.overall.label} onChange={(e) => edit((d) => void (d.overall.label = e.target.value))} />
                    </label>
                    <label>
                      Scale
                      <ScaleEditor value={draft.overall.scale} onChange={(s) => edit((d) => void (d.overall.scale = s ?? FIVE))} />
                    </label>
                  </div>
                  <label>
                    Description
                    <input value={draft.overall.description} onChange={(e) => edit((d) => void (d.overall.description = e.target.value))} />
                  </label>
                  <label>
                    Recommendation options, one per line (optional)
                    <AutoTextarea minRows={2} value={(draft.recommendations ?? []).join('\n')} onChange={(e) => edit((d) => void (d.recommendations = lines(e.target.value)))} placeholder={'Fund\nFund with revisions\nDo not fund'} />
                  </label>
                  <label>
                    Reviewer guidance, one per line (optional)
                    <AutoTextarea minRows={2} value={(draft.guidance ?? []).join('\n')} onChange={(e) => edit((d) => void (d.guidance = lines(e.target.value)))} placeholder="Notes shown in the Brief, e.g. what the agency asks reviewers to weigh" />
                  </label>
                </section>

                {error && <div className="callout callout-warn">{error}</div>}
                <footer className="fw-actions">
                  <button type="submit" className="btn btn-primary">
                    {isSaved ? 'Save changes' : 'Save framework'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={exportJson}>
                    <Download size={14} /> Export JSON
                  </button>
                  {isSaved && (
                    <button type="button" className="btn btn-ghost fw-delete" onClick={remove}>
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  <span className="grow" />
                  {dirty && <span className="muted small">Unsaved changes</span>}
                </footer>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pin the agencies you review for, hide the rest, and choose the default for new reviews. */
function MenuPrefs() {
  const all = useAllFrameworks();
  const prefs = useStore((s) => s.frameworkPrefs);
  const setPrefs = useStore((s) => s.setFrameworkPrefs);
  const togglePin = (id: string) => void setPrefs({ pinned: prefs.pinned.includes(id) ? prefs.pinned.filter((x) => x !== id) : [...prefs.pinned, id] });
  const toggleHide = (id: string) => {
    const hidden = prefs.hidden.includes(id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id];
    void setPrefs({ hidden, ...(hidden.includes(id) && prefs.defaultId === id ? { defaultId: undefined } : {}) });
  };
  const setDefault = (id: string) => void setPrefs({ defaultId: prefs.defaultId === id ? undefined : id });
  return (
    <>
      <div className="fw-side-title">Your menu</div>
      <p className="muted small">Pin the agencies you review for, hide the rest, and pick a default for new reviews. This follows you to every device.</p>
      <ul className="fw-menu">
        {all.map((f) => {
          const pinned = prefs.pinned.includes(f.id);
          const hidden = prefs.hidden.includes(f.id);
          const isDefault = prefs.defaultId === f.id;
          return (
            <li key={f.id} className={`fw-menu-row ${hidden ? 'is-hidden' : ''} ${pinned ? 'is-pinned' : ''}`}>
              <button type="button" className={`icon-btn fw-menu-btn ${pinned ? 'is-on' : ''}`} onClick={() => togglePin(f.id)} aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${f.name}`} title={pinned ? 'Unpin' : 'Pin to the top of the menu'}>
                <Star size={14} fill={pinned ? 'currentColor' : 'none'} />
              </button>
              <span className="fw-menu-name" title={f.name}>
                {f.name}
              </span>
              <button type="button" className={`icon-btn fw-menu-btn ${isDefault ? 'is-on' : ''}`} onClick={() => setDefault(f.id)} disabled={hidden} aria-pressed={isDefault} aria-label={`${isDefault ? 'Clear default:' : 'Default for new reviews:'} ${f.name}`} title={isDefault ? 'Default for new reviews (click to clear)' : 'Use for new reviews instead of detecting from the PDF'}>
                {isDefault ? <CircleDot size={14} /> : <Circle size={14} />}
              </button>
              <button type="button" className={`icon-btn fw-menu-btn ${hidden ? 'is-on' : ''}`} onClick={() => toggleHide(f.id)} aria-pressed={hidden} aria-label={`${hidden ? 'Show' : 'Hide'} ${f.name}`} title={hidden ? 'Show in menus' : 'Hide from menus'}>
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

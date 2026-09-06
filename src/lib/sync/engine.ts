/**
 * The sync engine.
 *
 * Local IndexedDB is the working copy; the server is the source of truth shared by every
 * device. Edits are written locally first, queued in an outbox, and pushed in batches.
 * Pulls ask for everything since the last server sequence the device saw and apply each
 * record if it is at least as new as what the device holds for that key. The engine polls
 * while the tab is visible and on focus, so a review edited on a phone shows up on the
 * laptop within a few seconds.
 */
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { api, ApiError, type ChangesIn, type ReviewOut } from '../api';
import { db, getSetting, setSetting, type OutboxRow } from '../db';
import { EMPTY_PREFS, type CustomFrameworkDef, type FrameworkPrefs } from '../frameworks';
import type { Review } from '../types';
import { applyRecord, diffRecords, isMergeKey } from './records';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'off';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSync?: number;
  message?: string;
}

export interface SyncHooks {
  /** A review changed remotely (or was created). `null` when it was deleted. */
  onReviewChanged(id: string, review: Review | null): void;
  onAccountChanged(frameworks: CustomFrameworkDef[]): void;
  /** The reviewer's framework menu preferences changed on another device. */
  onPrefsChanged(prefs: FrameworkPrefs): void;
  onStatus(status: SyncStatus): void;
  /** The review currently open in the workspace, if any. */
  currentReview(): Review | null;
}

/** Account record holding the reviewer's framework menu preferences. */
export const PREFS_KEY = 'prefs:frameworks';

const PUSH_DEBOUNCE_MS = 700;
const POLL_MS = 5000;
const BACKOFF_MAX_MS = 60_000;

export function deviceId(): string {
  try {
    let id = localStorage.getItem('panelist.device');
    if (!id) {
      id = nanoid(8);
      localStorage.setItem('panelist.device', id);
    }
    return id;
  } catch {
    return 'device';
  }
}

export class SyncEngine {
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null;
  private backoff = 0;
  private status: SyncStatus = { state: 'idle', pending: 0 };
  private listeners: Array<() => void> = [];
  private hooks: SyncHooks;

  constructor(hooks: SyncHooks) {
    this.hooks = hooks;
  }

  /* ---------- lifecycle ---------- */

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const onWake = () => {
      if (document.visibilityState === 'visible') void this.sync();
    };
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);
    this.listeners.push(
      () => window.removeEventListener('focus', onWake),
      () => window.removeEventListener('online', onWake),
      () => document.removeEventListener('visibilitychange', onWake),
    );
    await this.refreshPending();
    await this.sync();
    this.schedulePoll();
  }

  stop(): void {
    this.running = false;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    for (const off of this.listeners) off();
    this.listeners = [];
  }

  private schedulePoll(): void {
    if (!this.running) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    const wait = this.backoff ? Math.min(this.backoff, BACKOFF_MAX_MS) : POLL_MS;
    this.pollTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') void this.sync();
      this.schedulePoll();
    }, wait);
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.hooks.onStatus(this.status);
  }

  private async refreshPending(): Promise<void> {
    const pending = await db.outbox.count();
    this.setStatus({ pending });
  }

  /* ---------- recording local changes ---------- */

  /** Queue the records that differ between two versions of a review. */
  async recordChanges(prev: Review | null, next: Review): Promise<void> {
    const changes = diffRecords(prev, next);
    if (!changes.length && prev) return;
    const now = Date.now();
    const rows: OutboxRow[] = changes.map((c) => ({ reviewId: next.id, key: c.key, data: c.data, updatedAt: now, deleted: c.deleted }));
    if (!prev) rows.unshift({ reviewId: next.id, key: '__review__', data: { id: next.id, created_at: next.createdAt, updated_at: now, deleted: false }, updatedAt: now, deleted: false });
    await db.outbox.bulkAdd(rows);
    await db.syncstate.bulkPut(changes.map((c) => ({ id: `${next.id}|${c.key}`, reviewId: next.id, key: c.key, ts: now })));
    await this.refreshPending();
    this.schedulePush();
  }

  async recordReviewDeleted(id: string): Promise<void> {
    const now = Date.now();
    await db.outbox.add({ reviewId: id, key: '__review__', data: { id, created_at: now, updated_at: now, deleted: true }, updatedAt: now, deleted: true });
    await this.refreshPending();
    this.schedulePush();
  }

  async recordAccount(key: string, data: unknown, deleted = false): Promise<void> {
    const now = Date.now();
    await db.outbox.add({ reviewId: null, key, data, updatedAt: now, deleted });
    await db.syncstate.put({ id: `account|${key}`, reviewId: '', key, ts: now });
    await this.refreshPending();
    this.schedulePush();
  }

  private schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.sync(), PUSH_DEBOUNCE_MS);
  }

  /* ---------- the round trip ---------- */

  /** Push the outbox, then pull. Coalesces concurrent calls. */
  sync(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async flushBeforeUnload(): Promise<void> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    await this.sync();
  }

  private async run(): Promise<void> {
    try {
      this.setStatus({ state: 'syncing' });
      await this.push();
      await this.pull();
      this.backoff = 0;
      this.setStatus({ state: 'idle', lastSync: Date.now(), message: undefined });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.setStatus({ state: 'off', message: 'Signed out' });
        return;
      }
      this.backoff = this.backoff ? Math.min(this.backoff * 2, BACKOFF_MAX_MS) : POLL_MS;
      const offline = !(e instanceof ApiError) || e.status === 0;
      this.setStatus({ state: offline ? 'offline' : 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      await this.refreshPending();
    }
  }

  private async push(): Promise<void> {
    const rows = await db.outbox.orderBy('id').toArray();
    if (!rows.length) return;
    // Latest write per key wins within the batch; keep row ids to delete after success.
    const latest = new Map<string, OutboxRow>();
    for (const r of rows) latest.set(`${r.reviewId ?? 'account'}|${r.key}`, r);
    const body: ChangesIn = { reviews: [], records: [], account: [] };
    for (const r of latest.values()) {
      if (r.key === '__review__') body.reviews!.push(r.data as ReviewOut);
      else if (r.reviewId === null) body.account!.push({ key: r.key, data: r.data, updated_at: r.updatedAt, deleted: r.deleted });
      else body.records!.push({ review_id: r.reviewId, key: r.key, data: r.data, updated_at: r.updatedAt, deleted: r.deleted });
    }
    await api.push(body);
    await db.outbox.bulkDelete(rows.map((r) => r.id!));
  }

  private async pull(): Promise<void> {
    const cursor = await getSetting<number>('sync.cursor', 0);
    const changes = await api.pull(cursor);
    if (changes.seq === cursor) return;

    // Group records by review.
    const byReview = new Map<string, typeof changes.records>();
    for (const rec of changes.records) byReview.set(rec.review_id, [...(byReview.get(rec.review_id) ?? []), rec]);
    const deletedReviews = new Set(changes.reviews.filter((r) => r.deleted).map((r) => r.id));

    for (const id of deletedReviews) {
      await db.files.where('reviewId').equals(id).delete();
      await db.reviews.delete(id);
      await db.syncstate.where('reviewId').equals(id).delete();
      this.hooks.onReviewChanged(id, null);
    }

    for (const [reviewId, recs] of byReview) {
      if (deletedReviews.has(reviewId)) continue;
      const current = this.hooks.currentReview();
      const base = current && current.id === reviewId ? current : await db.reviews.get(reviewId);
      const createdMeta = changes.reviews.find((r) => r.id === reviewId);
      const seed: Review = base ?? emptyReview(reviewId, createdMeta?.created_at ?? Date.now());
      const local = await db.syncstate.where('reviewId').equals(reviewId).toArray();
      const localTs = new Map(local.map((s) => [s.key, s.ts]));
      let touched = false;
      const next = produce(seed, (draft) => {
        for (const rec of recs) {
          const mine = localTs.get(rec.key) ?? 0;
          if (!isMergeKey(rec.key) && rec.updated_at < mine) continue; // we have something newer
          applyRecord(draft, rec.key, rec.data, rec.deleted);
          touched = true;
        }
        if (touched) draft.updatedAt = Math.max(draft.updatedAt, ...recs.map((r) => r.updated_at));
      });
      if (!touched && base) continue;
      await db.syncstate.bulkPut(recs.map((r) => ({ id: `${reviewId}|${r.key}`, reviewId, key: r.key, ts: Math.max(r.updated_at, localTs.get(r.key) ?? 0) })));
      await db.reviews.put(next);
      this.hooks.onReviewChanged(reviewId, next);
    }

    // Reviews that exist on the server but carry no record changes this round (rare) are
    // created empty so the library shows them; their records arrive with the same seq.
    for (const rv of changes.reviews) {
      if (rv.deleted || byReview.has(rv.id)) continue;
      if (!(await db.reviews.get(rv.id))) {
        const seeded = emptyReview(rv.id, rv.created_at);
        await db.reviews.put(seeded);
        this.hooks.onReviewChanged(rv.id, seeded);
      }
    }

    if (changes.account.length) {
      const defs = await getSetting<CustomFrameworkDef[]>('customFrameworks', []);
      const map = new Map(defs.map((d) => [d.id, d]));
      let prefs: FrameworkPrefs | undefined;
      for (const rec of changes.account) {
        const isFramework = rec.key.startsWith('framework:');
        if (!isFramework && rec.key !== PREFS_KEY) continue;
        const mineRow = await db.syncstate.get(`account|${rec.key}`);
        if (mineRow && rec.updated_at < mineRow.ts) continue;
        if (isFramework) {
          const id = rec.key.slice('framework:'.length);
          if (rec.deleted) map.delete(id);
          else map.set(id, rec.data as CustomFrameworkDef);
        } else {
          prefs = rec.deleted ? EMPTY_PREFS : { ...EMPTY_PREFS, ...(rec.data as Partial<FrameworkPrefs>) };
        }
        await db.syncstate.put({ id: `account|${rec.key}`, reviewId: '', key: rec.key, ts: rec.updated_at });
      }
      const merged = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
      await setSetting('customFrameworks', merged);
      this.hooks.onAccountChanged(merged);
      if (prefs) {
        await setSetting('frameworkPrefs', prefs);
        this.hooks.onPrefsChanged(prefs);
      }
    }

    await setSetting('sync.cursor', changes.seq);
  }
}

export function emptyReview(id: string, createdAt: number): Review {
  return {
    id,
    title: 'Untitled review',
    createdAt,
    updatedAt: createdAt,
    frameworkId: 'generic',
    docs: [],
    annotations: [],
    scores: {},
    overall: { comment: '' },
    checklist: {},
    draft: { summary: '', additional: '', confidential: '' },
    facts: {},
    visited: {},
    lastPage: {},
    activeMs: 0,
    activeByDevice: {},
  };
}

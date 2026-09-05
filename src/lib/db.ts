import Dexie, { type EntityTable } from 'dexie';
import type { Review } from './types';

export interface StoredFile {
  id: string; // doc id
  reviewId: string;
  name: string;
  blob: Blob;
}

export interface Setting {
  key: string;
  value: unknown;
}

/** A local change waiting to be pushed to the server. */
export interface OutboxRow {
  id?: number;
  /** null for account-level records (custom frameworks) */
  reviewId: string | null;
  key: string;
  data: unknown;
  updatedAt: number;
  deleted: boolean;
}

/** The newest timestamp this device holds for a record, for merge decisions. */
export interface SyncStateRow {
  id: string; // `${reviewId}|${key}` or `account|${key}`
  reviewId: string;
  key: string;
  ts: number;
}

class PanelistDB extends Dexie {
  reviews!: EntityTable<Review, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  outbox!: EntityTable<OutboxRow, 'id'>;
  syncstate!: EntityTable<SyncStateRow, 'id'>;

  constructor() {
    super('panelist');
    this.version(1).stores({
      reviews: 'id, updatedAt',
      files: 'id, reviewId',
      settings: 'key',
    });
    this.version(2).stores({
      reviews: 'id, updatedAt',
      files: 'id, reviewId',
      settings: 'key',
      outbox: '++id, reviewId',
      syncstate: 'id, reviewId',
    });
  }
}

export const db = new PanelistDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.settings.get(key);
    return (row?.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch {
    /* storage unavailable; ignore */
  }
}

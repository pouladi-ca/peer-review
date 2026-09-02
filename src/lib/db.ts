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

class PanelistDB extends Dexie {
  reviews!: EntityTable<Review, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor() {
    super('panelist');
    this.version(1).stores({
      reviews: 'id, updatedAt',
      files: 'id, reviewId',
      settings: 'key',
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

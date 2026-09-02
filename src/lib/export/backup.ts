import { db } from '../db';
import type { Review } from '../types';

export interface Backup {
  app: 'panelist';
  version: 1;
  exportedAt: number;
  review: Review;
  files: { id: string; name: string; type: string; base64: string }[];
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function createBackup(review: Review, includeFiles = true): Promise<Backup> {
  const files: Backup['files'] = [];
  if (includeFiles) {
    for (const d of review.docs) {
      const f = await db.files.get(d.id);
      if (f) files.push({ id: d.id, name: f.name, type: f.blob.type || 'application/pdf', base64: toBase64(await f.blob.arrayBuffer()) });
    }
  }
  return { app: 'panelist', version: 1, exportedAt: Date.now(), review, files };
}

export function parseBackup(json: string): { review: Review; files: { id: string; name: string; blob: Blob }[] } {
  const data = JSON.parse(json) as Partial<Backup>;
  if (data.app !== 'panelist' || !data.review || !Array.isArray(data.files)) throw new Error('Not a Panelist backup file.');
  const files = data.files.map((f) => ({ id: f.id, name: f.name, blob: new Blob([fromBase64(f.base64) as BlobPart], { type: f.type || 'application/pdf' }) }));
  return { review: data.review, files };
}

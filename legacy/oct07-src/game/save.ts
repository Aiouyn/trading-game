import type { WorldState } from '@/engine';
import type { History } from './history';
import type { WireItem } from './wire';

/** Autosave slot in IndexedDB. Phase 0 is single-player and local only. */
export interface SaveGame {
  saveVersion: 1;
  savedAt: number;
  world: WorldState;
  history: History;
  wire: WireItem[];
}

const DB = 'trading-game';
const STORE = 'saves';
const KEY = 'slot-1';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export function isSaveGame(x: unknown): x is SaveGame {
  const s = x as SaveGame | null;
  return !!s && s.saveVersion === 1 && !!s.world && s.world.version === 1 && !!s.history && s.history.version === 1;
}

export async function loadGame(): Promise<SaveGame | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const v = await tx<unknown>('readonly', (s) => s.get(KEY));
    return isSaveGame(v) ? v : null;
  } catch {
    return null;
  }
}

export async function saveGame(save: SaveGame): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await tx('readwrite', (s) => s.put(save, KEY));
  } catch {
    // a failed autosave must never break play; the next one retries
  }
}

export async function clearSave(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}

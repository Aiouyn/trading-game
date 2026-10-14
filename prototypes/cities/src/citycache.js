// Generated cities, kept in this browser's IndexedDB under a generator version. Every call is wrapped: when storage is
// missing, blocked or full, the page simply generates the city again (readCity gives null, writeCity does nothing).

import { cityCacheKey } from './cache-key.js';

/** Bump when the generator's output changes, so stale cities are never read back. */
export const GEN_VERSION = 'inhabitable-v2-11';
const DB = 'cities-cache';
const STORE = 'cities';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('cities cache blocked'));
  });
}

/** The cached city for a personality id (without its personality object), or null. */
export async function readCity(id, seed) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(cityCacheKey(id, seed, GEN_VERSION));
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

/** Store a generated city (its data only). Resolves when the write is committed; failures are ignored. */
export async function writeCity(id, seed, city) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(city, cityCacheKey(id, seed, GEN_VERSION));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // no cache this time: the city is generated again next visit
  }
}

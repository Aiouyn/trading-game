// Device-local state in IndexedDB under key `quay.<accountId>` (17 §2.2). Never sent.
import type { ShellLocalState } from "./types";

const DB = "quay";
const STORE = "local";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const localKey = (accountId: string) => `quay.${accountId}`;

export async function loadLocal(accountId: string): Promise<Partial<ShellLocalState> | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await open();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(localKey(accountId));
    req.onsuccess = () => resolve((req.result as Partial<ShellLocalState> | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function saveLocal(accountId: string, state: ShellLocalState): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await open();
  db.transaction(STORE, "readwrite").objectStore(STORE).put(state, localKey(accountId));
}

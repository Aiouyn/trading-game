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
  // Resolve only once the transaction has committed, so a reload right after sees the write.
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
    tx.objectStore(STORE).put(state, localKey(accountId));
  });
}

/** Writes are serialised; `flushLocal()` resolves once every write queued so far has committed. */
let queue: Promise<void> = Promise.resolve();
export function queueSave(accountId: string, state: ShellLocalState): Promise<void> {
  queue = queue.catch(() => {}).then(() => saveLocal(accountId, state));
  return queue;
}
export function flushLocal(): Promise<void> {
  return queue;
}
if (typeof window !== "undefined") {
  (window as Window & { __quayFlush?: () => Promise<void> }).__quayFlush = flushLocal;
}

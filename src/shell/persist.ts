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
  return put(localKey(accountId), state);
}

async function put(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await open();
  // Resolve only once the transaction has committed, so a reload right after sees the write.
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
    tx.objectStore(STORE).put(value, key);
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
/** One device record, read: a read that fails rejects (an unreadable copy is not an empty one). */
async function readKey(key: string): Promise<unknown> {
  if (typeof indexedDB === "undefined") throw new DOMException("No IndexedDB here", "NotSupportedError");
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
/** Changes one record in ONE readwrite transaction: the stored copy is read, `change` (synchronous) gives the new one,
 *  which is put back. IndexedDB never runs two readwrite transactions on a store at once (other tabs included), so
 *  nothing written in between is lost. Resolves with what was kept, once committed; rejects (nothing changed) if the
 *  transaction fails. Queued after this page's earlier writes. */
function updateKey(key: string, change: (stored: unknown) => unknown): Promise<unknown> {
  const run = async () => {
    if (typeof indexedDB === "undefined") throw new DOMException("No IndexedDB here", "NotSupportedError");
    const db = await open();
    return new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      let next: unknown = null;
      const req = os.get(key);
      req.onsuccess = () => {
        try { next = change(req.result ?? null); os.put(next, key); } catch (e) { reject(e); tx.abort(); }
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
    });
  };
  const done = queue.catch(() => {}).then(run);
  queue = done.then(() => {}, () => {});
  return done;
}

/** The account's Broker chart drawings on this device (`quay.<accountId>.drawings`; "guest" when signed out). Never
 *  sent: another device or browser has its own. Unparsed here; the reader validates. */
export const drawingsKey = (accountId: string) => `${localKey(accountId)}.drawings`;
export const loadDrawings = (accountId: string): Promise<unknown> => readKey(drawingsKey(accountId));
export const updateDrawings = (accountId: string, change: (stored: unknown) => unknown): Promise<unknown> => updateKey(drawingsKey(accountId), change);

/** The account's Broker chart overlay choices on this device (`quay.<accountId>.chart`; "guest" when signed out), its
 *  own record: a change never rewrites the drawings or the shell's state. Unparsed here; the reader validates. */
export const chartPrefsKey = (accountId: string) => `${localKey(accountId)}.chart`;
export const loadChartPrefs = (accountId: string): Promise<unknown> => readKey(chartPrefsKey(accountId));
export const updateChartPrefs = (accountId: string, change: (stored: unknown) => unknown): Promise<unknown> => updateKey(chartPrefsKey(accountId), change);

if (typeof window !== "undefined") {
  (window as Window & { __quayFlush?: () => Promise<void> }).__quayFlush = flushLocal;
}

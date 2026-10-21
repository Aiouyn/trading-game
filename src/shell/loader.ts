// Mock loader for the §5 error / offline states. In dev / e2e builds a URL script makes it fail always or once
// (Retry then succeeds). Offline follows the browser's online/offline events.
import type { SystemState } from "./channels";
import type { ShellStore } from "./store";

/** e2e-only `?load=fail|fail1` and `?retryMs=` hooks. Build-time gate: NODE_ENV and NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL
 *  (always defined "1"/"0" in next.config.ts) are inlined, so a production build without the e2e opt-in folds
 *  LOAD_FAIL_HOOK to false and the hook reads are eliminated as dead code. The e2e build opts in. */
export const LOAD_FAIL_HOOK: boolean =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL === "1";
/** `?load=` mode when the hook is compiled in, else null. */
export const loadHookMode: (q: URLSearchParams) => string | null = LOAD_FAIL_HOOK ? (q) => q.get("load") : () => null;
const loadHookRetryMs: (q: URLSearchParams) => number = LOAD_FAIL_HOOK ? (q) => Number(q.get("retryMs") ?? 300) : () => 300;
const loadHookFails: (m: string | null, attempts: number) => boolean = LOAD_FAIL_HOOK
  ? (m, a) => m === "fail" || (m === "fail1" && a < 1)
  : () => false;
/** True when the mock should start in the error state (`?load=fail…`). */
export const loadHookStartsFailed = (q: URLSearchParams): boolean => loadHookFails(loadHookMode(q), 0);

let retryMs = 300; // mock latency; `?retryMs=` lets e2e hold the pending state
let attempts = 0;
let mode: string | null = null;
let store: ShellStore | null = null;

function setSystem(patch: Partial<SystemState>) {
  if (!store) return;
  const c = store.getState().channels;
  store.getState().setChannels({ ...c, system: { ...c.system, ...patch } });
}

export function initLoader(s: ShellStore, q: URLSearchParams): void {
  store = s;
  mode = loadHookMode(q);
  retryMs = loadHookRetryMs(q);
  attempts = loadHookStartsFailed(q) ? 1 : 0;
  const on = () => setSystem({ offline: !navigator.onLine });
  on();
  window.addEventListener("online", on);
  window.addEventListener("offline", on);
}

/** Retry: re-check connectivity and re-run the (mock) load. */
let retries = 0;
if (typeof window !== "undefined") (window as Window & { __quayRetries?: () => number }).__quayRetries = () => retries;

export function retryLoad(): void {
  if (store?.getState().channels.system.load === "loading") return; // pending: ignore activation
  retries += 1;
  setSystem({ offline: !navigator.onLine, load: "loading" });
  window.setTimeout(() => {
    const fail = loadHookFails(mode, attempts);
    attempts += 1;
    setSystem({ offline: !navigator.onLine, load: fail ? "error" : "ok" });
  }, retryMs);
}

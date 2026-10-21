// Mock loader for the §5 error / offline states. In dev / e2e builds a URL script makes it fail always or once
// (Retry then succeeds). Offline follows the browser's online/offline events.
import type { SystemState } from "./channels";
import { MOCK_HOOKS } from "./hooks";
import type { ShellStore } from "./store";

let retryMs = 300; // mock latency; e2e can lengthen it to hold the pending state
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
  // Scripted failures are build-gated (hooks.ts): a no-flag build never reads (or ships) these params.
  mode = MOCK_HOOKS ? q.get("load") : null;
  retryMs = MOCK_HOOKS ? Number(q.get("retryMs") ?? 300) : 300;
  attempts = mode?.startsWith("fail") ? 1 : 0;
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
    const fail = mode === "fail" || (mode === "fail1" && attempts < 1);
    attempts += 1;
    setSystem({ offline: !navigator.onLine, load: fail ? "error" : "ok" });
  }, retryMs);
}

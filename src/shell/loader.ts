// Mock loader for the §5 error / offline states. `?load=fail` always fails, `?load=fail1` fails once
// (Retry then succeeds). Offline follows the browser's online/offline events.
import type { SystemState } from "./channels";
import type { ShellStore } from "./store";

const RETRY_MS = 300;
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
  mode = q.get("load");
  attempts = mode?.startsWith("fail") ? 1 : 0;
  const on = () => setSystem({ offline: !navigator.onLine });
  on();
  window.addEventListener("online", on);
  window.addEventListener("offline", on);
}

/** Retry: re-check connectivity and re-run the (mock) load. */
export function retryLoad(): void {
  setSystem({ offline: !navigator.onLine, load: "loading" });
  window.setTimeout(() => {
    const fail = mode === "fail" || (mode === "fail1" && attempts < 1);
    attempts += 1;
    setSystem({ offline: !navigator.onLine, load: fail ? "error" : "ok" });
  }, RETRY_MS);
}

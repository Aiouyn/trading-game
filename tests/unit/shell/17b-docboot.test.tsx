// @vitest-environment happy-dom
// 17B S1-02 / Boot once: a client-side route change (/settings → /settings/SET-08) remounts QuayShell. The per-document
// boot (loader hooks, saved-window restore, save subscription) must not run again: a second initLoader re-registers the
// online/offline listeners, a second loadLocal overwrites live windows with the saved snapshot, and a second
// store.subscribe doubles every save.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ShellStore } from "@/shell/store";

const calls = vi.hoisted(() => ({ initLoader: 0, loadLocal: 0, queueSave: 0, stores: [] as unknown[] }));

vi.mock("@/shell/loader", async (orig) => {
  const real = await orig<typeof import("@/shell/loader")>();
  return { ...real, initLoader: (...a: Parameters<typeof real.initLoader>) => { calls.initLoader++; return real.initLoader(...a); } };
});
vi.mock("@/shell/persist", async (orig) => {
  const real = await orig<typeof import("@/shell/persist")>();
  return {
    ...real,
    loadLocal: async () => { calls.loadLocal++; return null; },
    queueSave: async () => { calls.queueSave++; },
  };
});
vi.mock("@/shell/store", async (orig) => {
  const real = await orig<typeof import("@/shell/store")>();
  return { ...real, createShellStore: (...a: Parameters<typeof real.createShellStore>) => { const s = real.createShellStore(...a); calls.stores.push(s); return s; } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("boot runs once per document across a client-side route change: one initLoader, one loadLocal, one save listener", async () => {
  const { QuayShell } = await import("@/components/shell/QuayShell");
  history.replaceState(null, "", "/settings");
  const root = createRoot(document.createElement("div"));
  await act(async () => { root.render(createElement(QuayShell, { key: "settings", route: ["settings"], query: "" })); });
  // Client-side navigation: the App Router remounts the catch-all page (new key) with the new route params.
  history.pushState(null, "", "/settings/SET-08");
  await act(async () => { root.render(createElement(QuayShell, { key: "settings/SET-08", route: ["settings", "SET-08"], query: "" })); });
  await act(async () => { await Promise.resolve(); });

  expect(calls.stores).toHaveLength(1);
  expect.soft(calls.initLoader, "initLoader calls").toBe(1);
  expect.soft(calls.loadLocal, "loadLocal calls").toBe(1);
  // One device-local change → one queued save (a second subscription would queue two).
  const store = calls.stores[0] as ShellStore;
  calls.queueSave = 0;
  act(() => { store.getState().toggleFocusMode(); });
  expect.soft(calls.queueSave, "saves queued by one local change (save listeners)").toBe(1);
  act(() => { root.unmount(); });
});

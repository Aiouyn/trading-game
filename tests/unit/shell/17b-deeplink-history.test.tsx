// @vitest-environment happy-dom
// 17B S1-02 (desktop): a client-side deep link /settings → /settings/SET-08 keeps the URL Next committed. Applying the
// deep link focuses the Settings window; that focus change must not write a section-less /settings over it.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { applyDeepLink, useBackStack } from "@/shell/back";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("a deep link's focus change writes no history; the entry keeps the screen segment and the query", async () => {
  const store: ShellStore = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  function Probe() { useBackStack(store); return null; }
  const root = createRoot(document.createElement("div"));
  await act(async () => { root.render(createElement(Probe)); });

  // Page load at /settings.
  history.replaceState(null, "", "/settings?rank=R0");
  applyDeepLink(store, { app: "settings" }, () => store.getState().open("settings", undefined, { deepLink: true }));
  expect(location.pathname + location.search).toBe("/settings?rank=R0");
  // A user focus change is still one history entry.
  const before = history.length;
  store.getState().open("portfolio");
  expect(location.pathname).toBe("/portfolio");
  expect(history.length).toBe(before + 1);

  // The Next router commits /settings/SET-08 (its own entry), then the remounted shell applies the deep link.
  history.pushState({ __NA: true }, "", "/settings/SET-08?rank=R0");
  const committed = history.length;
  applyDeepLink(store, { app: "settings", screen: "SET-08" }, () => store.getState().open("settings", undefined, { deepLink: true }));
  expect(store.getState().local.windows.at(-1)?.app).toBe("settings");
  expect(location.pathname + location.search).toBe("/settings/SET-08?rank=R0");
  expect(history.length).toBe(committed);
  expect(history.state).toMatchObject({ quay: "desk", app: "settings" });

  // A deep link to an app that is not the focused window gets no screen segment from it.
  history.pushState({ __NA: true }, "", "/nope/X-1");
  applyDeepLink(store, { app: "nope", screen: "X-1" }, () => {});
  expect(location.pathname).toBe("/settings");
  await act(async () => { root.unmount(); });
});

// @vitest-environment happy-dom
// Card 19 (playtest #4): an early "Connection lost · retrying" notice, EN + FR from the strings table, in the
// desktop LoadState pill and the phone banner stack. No Retry button: the feed retries on its own (backoff).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoadState } from "@/components/shell/LoadState";
import { PhoneBannerStack } from "@/components/shell/PhoneBanners";
import { ShellCtx } from "@/components/shell/ShellContext";
import { defaultChannels } from "@/shell/mockChannels";
import { CONNECTION_LOST, S } from "@/shell/strings";
import { createShellStore, type ShellStore } from "@/shell/store";
import { guestChannels } from "@/shell/accountDemoBoundary";

let el: HTMLDivElement; let root: Root; let store: ShellStore;
beforeEach(() => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); store = createShellStore(defaultChannels()); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); });

const sys = (patch: Partial<ReturnType<ShellStore["getState"]>["channels"]["system"]>) => act(async () => {
  const c = store.getState().channels;
  store.getState().setChannels({ ...c, system: { ...c.system, ...patch } });
});
const render = (node: ReturnType<typeof createElement>, locale: "en" | "fr") => act(async () => {
  store.setState({ prefs: { ...store.getState().prefs, locale } });
  root.render(createElement(ShellCtx.Provider, { value: store }, node));
});
const $ = (id: string) => el.querySelector(`[data-testid="${id}"]`);

describe.each(["en", "fr"] as const)("connection-lost notice (%s)", (locale) => {
  it("desktop pill: shows while reconnecting, no Retry, gone when live", async () => {
    await render(createElement(LoadState), locale);
    expect($("load-message")).toBeNull();
    await sys({ connection: "reconnecting" });
    expect($("connection-lost")).not.toBeNull();
    expect($("load-message")!.textContent).toBe(CONNECTION_LOST[locale]);
    expect($("load-message")!.getAttribute("role")).toBe("alert");
    expect($("load-retry")).toBeNull();
    await sys({ connection: "live" });
    expect($("load-message")).toBeNull();
  });
  it("phone banner stack: same copy", async () => {
    await render(createElement(PhoneBannerStack), locale);
    await sys({ connection: "reconnecting" });
    expect(el.textContent).toContain(CONNECTION_LOST[locale]);
    await sys({ connection: "live" });
    expect(el.textContent).not.toContain(CONNECTION_LOST[locale]);
  });
  it("offline wins over connection lost", async () => {
    await render(createElement(LoadState), locale);
    await sys({ connection: "reconnecting", offline: true });
    expect($("load-message")!.textContent).toBe(S.offline);
  });
});

describe("(d) guest shell unchanged", () => {
  it("guest channels start live: no notice, no pill, no banner", async () => {
    store = createShellStore(guestChannels());
    await render(createElement(LoadState), "en");
    expect($("load-message")).toBeNull();
    await act(async () => root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneBannerStack))));
    expect(el.textContent).not.toContain(CONNECTION_LOST.en);
  });
});

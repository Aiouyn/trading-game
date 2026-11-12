import { expect, it } from "vitest";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";

it("store.open with deepLink reuses the existing Broker window (playtest d40)", () => {
  const store = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  store.getState().open("broker");
  expect(store.getState().local.windows.filter((w) => w.app === "broker")).toHaveLength(1);
  store.getState().open("broker", undefined, { deepLink: true, reuse: true });
  store.getState().open("broker", "HALC", { deepLink: true, reuse: true });
  const brokers = store.getState().local.windows.filter((w) => w.app === "broker");
  expect(brokers).toHaveLength(1);
  expect(brokers[0].context).toBe("HALC");
  expect(store.getState().local.windows.at(-1)?.app).toBe("broker");
});

it("store.open without deepLink can still open a second Broker", () => {
  const store = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  store.getState().open("broker", "HALC");
  store.getState().open("broker", "NRON");
  expect(store.getState().local.windows.filter((w) => w.app === "broker")).toHaveLength(2);
});

it("a deep-link reuse restores a minimized Broker window", () => {
  const store = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  store.getState().open("broker");
  const first = store.getState().local.windows.find((w) => w.app === "broker")!;
  const { w, h, x, y } = first;
  store.getState().toggleCollapse(first);
  expect(store.getState().local.windows.find((win) => win.app === "broker")?.collapsed).toBe(true);
  store.getState().open("broker", undefined, { deepLink: true, reuse: true });
  const brokers = store.getState().local.windows.filter((win) => win.app === "broker");
  expect(brokers).toHaveLength(1);
  expect(brokers[0].collapsed).toBe(false);
  expect(brokers[0]).toMatchObject({ w, h, x, y });
  expect(store.getState().local.windows.at(-1)?.app).toBe("broker");
});

it("a deep-link reuse with an asset restores the minimized window and applies the context", () => {
  const store = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  store.getState().open("broker");
  store.getState().toggleCollapse(store.getState().local.windows.find((w) => w.app === "broker")!);
  store.getState().open("broker", "HALC", { deepLink: true, reuse: true });
  const brokers = store.getState().local.windows.filter((w) => w.app === "broker");
  expect(brokers).toHaveLength(1);
  expect(brokers[0].collapsed).toBe(false);
  expect(brokers[0].context).toBe("HALC");
});

it("a same-context or at-cap open without deepLink leaves a minimized Broker collapsed", () => {
  const store = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  store.getState().open("broker", "HALC");
  store.getState().toggleCollapse(store.getState().local.windows.find((w) => w.app === "broker")!);
  store.getState().open("broker", "HALC");
  expect(store.getState().local.windows.filter((w) => w.app === "broker")).toHaveLength(1);
  expect(store.getState().local.windows.find((w) => w.app === "broker")?.collapsed).toBe(true);

  store.getState().open("broker", "AVB");
  store.getState().open("broker", "KILN");
  store.getState().open("broker", "MRDN");
  expect(store.getState().local.windows.filter((w) => w.app === "broker")).toHaveLength(4);
  const main = store.getState().local.windows.find((w) => w.app === "broker" && w.context === "HALC")!;
  expect(main.collapsed).toBe(true);
  store.getState().open("broker", "TIDE");
  const brokers = store.getState().local.windows.filter((w) => w.app === "broker");
  expect(brokers).toHaveLength(4);
  expect(brokers.find((w) => w.context === "HALC")?.collapsed).toBe(true);
});

it("an in-app deepLink open without reuse (Positions Close) still opens its own Broker, so card 34's cap rule holds", () => {
  const store = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  store.getState().open("broker", "NRON");
  store.getState().open("broker", "HALC", { deepLink: true });
  const brokers = store.getState().local.windows.filter((w) => w.app === "broker");
  expect(brokers.map((w) => w.context)).toEqual(["NRON", "HALC"]);
});

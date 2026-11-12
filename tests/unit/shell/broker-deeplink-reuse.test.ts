import { expect, it } from "vitest";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";

it("store.open with deepLink reuses the existing Broker window (playtest d40)", () => {
  const store = createShellStore(mockChannels(new URLSearchParams("")));
  store.getState().setViewport(1440, 900);
  store.getState().open("broker");
  expect(store.getState().local.windows.filter((w) => w.app === "broker")).toHaveLength(1);
  store.getState().open("broker", undefined, { deepLink: true });
  store.getState().open("broker", "HALC", { deepLink: true });
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

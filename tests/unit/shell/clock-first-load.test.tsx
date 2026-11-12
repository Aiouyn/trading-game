// @vitest-environment happy-dom
// Card 18: a signed-in top-bar clock must not print the boot tick (Day 39 · 11:20 / 27700)
// while the first /api/market read is held or has failed before any adopt.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusStrip } from "@/components/shell/StatusStrip";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { BrokerLedgerView } from "@/market/brokerLedger";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { LiveMarket } from "@/server/market/clock";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { authSession } from "@/shell/authSession";
import { SERVER_QUOTE_POLL_MS, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { clockAt, clockLabel, defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";
import { clockStrings } from "@/shell/strings";
import { serverHalfLoaded } from "../helpers/serverHalf";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOOT_TEXT = "Day 39 · 11:20";
const bootLabel = () => clockStrings("en").strip(...Object.values(clockLabel(clockAt(27700))) as [number, string]);

describe("signed-in top-bar clock before the first adopted tick", () => {
  let el: HTMLDivElement;
  let root: Root;
  let snap: MarketSnapshot;
  let marketMode: "ok" | "hold" | "500" | "net";
  let held: Array<() => void>;

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    snap = structuredClone(new LiveMarket().snapshot());
    marketMode = "ok";
    held = [];
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/market") {
        if (marketMode === "hold") await new Promise<void>((r) => held.push(r));
        if (marketMode === "500") return new Response("{}", { status: 500 });
        if (marketMode === "net") return Promise.reject(new TypeError("network down"));
        return Response.json(snap);
      }
      if (input === "/api/broker/me") {
        const body: BrokerLedgerView = {
          tick: snap.tick, cashCents: 1_000_000, reservedCashCents: 0,
          positions: {}, orders: {}, fills: [], intents: [], coins: [],
        };
        return Response.json(body);
      }
      if (input === "/api/auth/me") {
        return Response.json({
          account: { accountId: "acc_clk", handle: "clk_player", createdAtMs: 1, worldId: "world_port_avalon" },
          session: { sessionId: "ses_clk", expiresAtMs: 9e15 },
          player: { accountId: "acc_clk", cashCents: 1_000_000, positions: {}, openOrders: {} },
        });
      }
      return new Response(null, { status: 404 });
    }));
  });
  afterEach(async () => {
    held.forEach((r) => r());
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const clock = () => el.querySelector("[data-testid=clock]") as HTMLElement | null;
  const phase = () => el.querySelector("[data-testid=phase-label]")?.textContent ?? "";
  async function mount(store: ShellStore) {
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(StatusStrip))); });
    await serverHalfLoaded();
    await settle();
  }
  async function settle(ms = SNAP_DELAY_MS + 50) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); await Promise.resolve(); });
  }
  function signedInStore() {
    const store = createShellStore(defaultChannels());
    applySignedInDemo(store, "acc_clk", undefined, { cashCents: 1_000_000 });
    return store;
  }
  const noInventedTime = () => {
    const node = clock();
    expect(node).not.toBeNull();
    expect(node!.textContent).not.toContain(BOOT_TEXT);
    expect(node!.textContent).not.toContain("11:20");
    expect(node!.getAttribute("data-tick")).not.toBe("27700");
    expect(phase()).not.toContain("Market open");
  };

  it("a guest strip still shows the demo clock at the boot tick", async () => {
    expect(bootLabel()).toBe(BOOT_TEXT);
    await mount(createShellStore(defaultChannels()));
    expect(clock()?.textContent).toBe(BOOT_TEXT);
    expect(clock()?.getAttribute("data-tick")).toBe("27700");
  });

  it("while the first quote read is held, the signed-in clock is a loading state, not Day 39 · 11:20", async () => {
    marketMode = "hold";
    await mount(signedInStore());
    await settle(SERVER_QUOTE_POLL_MS + 50);
    noInventedTime();
    expect(clock()!.textContent).toMatch(/Time loading/);
    expect(clock()!.getAttribute("data-clock-state")).toBe("loading");
    expect(clock()!.textContent).toContain("—");
  });

  it("when the first quote read fails before any adopt, the clock is unavailable, not the boot time", async () => {
    marketMode = "500";
    await mount(signedInStore());
    await settle(SERVER_QUOTE_POLL_MS + 50);
    noInventedTime();
    expect(clock()!.textContent).toMatch(/Time unavailable/);
    expect(clock()!.getAttribute("data-clock-state")).toBe("unavailable");
  });

  it("after a held first read succeeds, the clock is the adopted server tick", async () => {
    marketMode = "hold";
    await mount(signedInStore());
    await settle(SERVER_QUOTE_POLL_MS + 50);
    noInventedTime();
    // LiveMarket opens at DEFAULT_TICK; step the snapshot so a successful adopt is visibly not the boot clock.
    snap = { ...snap, tick: snap.tick + 50 };
    marketMode = "ok";
    await act(async () => { held.splice(0).forEach((r) => r()); });
    await settle(SERVER_QUOTE_POLL_MS + 50);
    const { day, hhmm } = clockLabel(clockAt(snap.tick));
    const live = clockStrings("en").strip(day, hhmm);
    expect(live).not.toBe(BOOT_TEXT);
    expect(clock()!.textContent).toBe(live);
    expect(clock()!.getAttribute("data-tick")).toBe(String(snap.tick));
    expect(clock()!.getAttribute("data-clock-state")).toBe("live");
  });
});

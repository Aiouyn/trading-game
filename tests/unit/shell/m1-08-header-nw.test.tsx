// @vitest-environment happy-dom
// M1-08: the signed-in top bar NW is the `me` valuation (server ledger at server marks) or says it is not known yet.
// It never prints the sign-in cash (holdings left out) as "Saved net worth", whether the account read or the quote
// read failed, is still in flight, or a new account's feed has not answered (no previous account's value either).
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
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Mode = "ok" | "500" | "bad" | "net" | "hold";
const money = (minor: number) => `$${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

describe("M1-08 header NW truthfulness", () => {
  let el: HTMLDivElement;
  let root: Root;
  let snap: MarketSnapshot;
  let marketMode: Mode;
  let meMode: Mode;
  let account: "A" | "B";
  let held: Array<() => void>;
  const ledgers: Record<"A" | "B", () => BrokerLedgerView> = {
    A: () => ({ tick: snap.tick, cashCents: 987_304, reservedCashCents: 110, positions: { HALC: { assetId: "HALC", qty: "3", avgCost: "42.18" } }, orders: {}, fills: [], intents: [] }),
    B: () => ({ tick: snap.tick, cashCents: 1_000_000, reservedCashCents: 0, positions: {}, orders: {}, fills: [], intents: [] }),
  };
  const mark = () => Math.round(Number(snap.quotes.rows.HALC!.last) * 100);
  const nwA = () => 987_304 + 3 * mark();
  const fail = (m: Mode): Promise<Response> | null =>
    m === "500" ? Promise.resolve(new Response("{}", { status: 500 }))
      : m === "bad" ? Promise.resolve(Response.json({ nope: 1 }))
        : m === "net" ? Promise.reject(new TypeError("network down")) : null;

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    snap = structuredClone(new LiveMarket().snapshot());
    marketMode = "ok"; meMode = "ok"; account = "A"; held = [];
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/market") return fail(marketMode) ?? Response.json(snap);
      if (input === "/api/broker/me") {
        const who = account;
        if (meMode === "hold") await new Promise<void>((r) => held.push(r));
        return fail(meMode) ?? Response.json(ledgers[who]());
      }
      if (input === "/api/auth/me") {
        return Response.json({
          account: { accountId: "acc_a", handle: "pf_header", createdAtMs: 1, worldId: "world_port_avalon" },
          session: { sessionId: "ses_a", expiresAtMs: 9e15 },
          player: { accountId: "acc_a", cashCents: 987_304, positions: {}, openOrders: {} },
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

  const strip = () => el.querySelector("[data-testid=strip-nw]") as HTMLElement;
  async function mount(store: ShellStore) {
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(StatusStrip))); });
    await settle();
  }
  async function settle(ms = SNAP_DELAY_MS + 50) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); await Promise.resolve(); });
  }
  /** One server tick and the poll after it (a new tick re-reads the ledger). */
  async function serverTick() {
    snap = { ...snap, tick: snap.tick + 1 };
    await settle(SERVER_QUOTE_POLL_MS + 50);
  }
  function signedInStore(cashCents: number, id = "acc_a") {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, id, undefined, { cashCents });
    return store;
  }
  const notCashOnly = () => {
    expect(strip().textContent).not.toContain(money(987_304)); // the sign-in cash, holdings left out
    expect(strip().textContent).not.toMatch(/Saved net worth/);
    expect(strip().textContent).not.toMatch(/412/);
  };

  it("live: the strip is cash + holdings at the server mark, labelled saved", async () => {
    await mount(signedInStore(987_304));
    expect(strip().textContent).toContain(money(nwA()));
    expect(strip().textContent).toMatch(/Saved net worth/);
    expect(strip().dataset.nwState).toBe("live");
  });

  for (const mode of ["500", "bad", "net"] as const) {
    it(`account read ${mode}: unavailable (not cash-only); the next server tick restores the true NW`, async () => {
      meMode = mode;
      await mount(signedInStore(987_304));
      notCashOnly();
      expect(strip().textContent).toMatch(/Net worth unavailable/);
      expect(strip().dataset.nwState).toBe("unavailable");
      meMode = "ok";
      await serverTick();
      expect(strip().dataset.nwState).toBe("live");
      expect(strip().textContent).toContain(money(nwA()));
    });
    it(`quote read ${mode}: unavailable (not cash-only); the next good quote read restores the true NW`, async () => {
      marketMode = mode;
      await mount(signedInStore(987_304));
      await settle(SERVER_QUOTE_POLL_MS + 50);
      notCashOnly();
      expect(strip().dataset.nwState).toBe("unavailable");
      marketMode = "ok";
      await serverTick();
      expect(strip().dataset.nwState).toBe("live");
      expect(strip().textContent).toContain(money(nwA()));
    });
  }

  it("in flight: loading, no number", async () => {
    meMode = "hold";
    await mount(signedInStore(987_304));
    notCashOnly();
    expect(strip().textContent).not.toMatch(/\$\d/);
    expect(strip().textContent).toMatch(/Net worth loading/);
    expect(strip().dataset.nwState).toBe("loading");
  });

  it("account switch: B's header never shows A's NW (or B's boot cash) while B's reads are held; then B's own NW", async () => {
    const store = signedInStore(987_304);
    await mount(store);
    expect(strip().textContent).toContain(money(nwA()));
    const seen: string[] = [];
    const obs = new MutationObserver(() => seen.push(strip()?.textContent ?? ""));
    obs.observe(el, { subtree: true, childList: true, characterData: true });
    account = "B"; meMode = "hold";
    await act(async () => { applySignedInDemo(store, "acc_b", undefined, { cashCents: 1_000_000 }); });
    await settle();
    await serverTick();
    expect(strip().textContent).not.toMatch(/\$\d/);
    expect(strip().dataset.nwState).toBe("loading");
    meMode = "ok";
    await act(async () => { held.splice(0).forEach((r) => r()); });
    await settle(50);
    obs.disconnect();
    expect(strip().dataset.nwState).toBe("live");
    // $10,000.00 shows abbreviated in the chip; its title is the full value.
    expect(strip().textContent).toMatch(/\$10k/);
    expect(strip().querySelector("[title]")?.getAttribute("title")).toBe(money(1_000_000));
    expect(seen.length).toBeGreaterThan(0);
    for (const t of seen) expect(t).not.toContain(money(nwA()));
    expect(seen.filter((t) => /\$\d/.test(t)).every((t) => t.includes("$10k"))).toBe(true);
  });
});

// @vitest-environment happy-dom
// M2-01/02: the grow-$10k goal and first-trade guide. Figures are the server's (`me`), "done" only from the server
// ledger (a fill or a position), never from a click; the guide opens apps and places nothing; hiding is per account on
// this device; guests get the start + goal sentence and no guide; nothing renders while `me` is loading or failed.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoalGuide, { GoalEntry, guideStage, hiddenKey } from "@/apps/portfolio/GoalGuide";
import { GOAL_START, GOAL_TARGET, goalProgress } from "@/market/goal";
import { goalStrings } from "@/apps/portfolio/goalStrings";
import { Overview } from "@/apps/portfolio/Overview";
import { pfStrings } from "@/apps/portfolio/strings";
import { ShellCtx } from "@/components/shell/ShellContext";
import { START_CASH_CENTS } from "@/server/auth/service";
import * as authSession from "@/shell/authSession";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import type { MeTradingBody, MyFill } from "@/shell/contracts/channels";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { mockChannels, RANK_THRESHOLDS } from "@/shell/mockChannels";
import { RANK_NAMES } from "@/shell/registry";
import { createShellStore } from "@/shell/store";
import { portAvalonServer } from "../helpers/portAvalonServer";
import { serverHalfLoaded } from "../helpers/serverHalf";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fill: MyFill = { fillId: "f1", tick: 27706, assetId: "HALC", orderId: "o1", side: "BUY", qty: "5", price: "98.12", fee: "0.49", feeCcy: "FDL", liquidity: "TAKER", counterpartyKind: "NPC" };
const me = (o: Partial<MeTradingBody> = {}): MeTradingBody => ({
  balances: { FDL: "10000.00" }, nw: "10000.00", nwi: "100", restricted: [], positions: {}, orders: {}, fills: [], margin: null, holds: {}, intents: [], alerts: [], ...o,
});
const signedIn = (id: string) => ({ status: "signed_in", account: { accountId: id, handle: id, createdAtMs: 1, worldId: "world_port_avalon" }, session: { sessionId: `s_${id}`, expiresAtMs: 9e15 }, player: { accountId: id, cashCents: 1_000_000, positions: {}, openOrders: {} }, world: { worldId: "world_port_avalon", marketSeed: 17 } }) as unknown as ReturnType<typeof authSession.useAuthSession>;

describe("M2-01/02 goal + first-trade guide", () => {
  let el: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    window.localStorage.clear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  async function mountGuide(body: MeTradingBody, accountId = "acc_a", store = createShellStore(mockChannels(new URLSearchParams()))) {
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(GoalGuide, { me: body, accountId, locale: "en", phone: false }))); });
    return store;
  }

  it("the goal is the server's $10,000 start and the first rank threshold ($20,000, Hustler), in the copy too", () => {
    expect(GOAL_START).toBe((START_CASH_CENTS / 100).toFixed(2));
    expect(GOAL_TARGET).toBe(RANK_THRESHOLDS[0]);
    expect(RANK_NAMES.R1).toBe("Hustler");
    expect(goalStrings("en").goal).toBe("Grow your $10,000 to $20,000 (Hustler).");
    expect(pfStrings("en").guestGoal).toContain("$10,000");
    expect(pfStrings("en").guestGoal).toContain("$20,000");
    expect(["10000.00", "9000.00", "12500.49", "19999.99", "20000.00", "25000", "x"].map(goalProgress)).toEqual([
      { pct: 0, below: false, reached: false }, { pct: 0, below: true, reached: false }, { pct: 25, below: false, reached: false },
      { pct: 99, below: false, reached: false }, { pct: 100, below: false, reached: true }, { pct: 100, below: false, reached: true }, { pct: 0, below: false, reached: false }]);
  });

  it("stage comes from the ledger only: start, an open order is waiting, a fill or a position is done", () => {
    expect(guideStage(me())).toBe("start");
    expect(guideStage(me({ orders: { o1: {} as never } }))).toBe("waiting");
    expect(guideStage(me({ fills: [fill] }))).toBe("done");
    expect(guideStage(me({ positions: { HALC: {} as never } }))).toBe("done");
  });

  it("fresh account: goal, saved NW, progress 0, three steps; the buttons open Wire / Broker and place nothing", async () => {
    const store = await mountGuide(me());
    expect(q("pf-goal")!.dataset.stage).toBe("start");
    expect(q("pf-goal-line")!.textContent).toBe("Grow your $10,000 to $20,000 (Hustler).");
    expect(q("pf-goal-now")!.textContent).toBe("Saved net worth now $10,000.00 of $20,000.00");
    const bar = q("pf-goal-bar")!;
    expect([bar.getAttribute("role"), bar.getAttribute("aria-valuenow"), bar.getAttribute("aria-label")]).toEqual(["progressbar", "0", "Progress from $10,000 to $20,000"]);
    expect([1, 2, 3].map((n) => q(`pf-guide-step-${n}`)!.textContent)).toEqual([
      "Read a Wire story: it names an asset. Some stories also say why a price moved. Stories are clues, not promises.Open Wire",
      "In Broker, pick an asset, enter a quantity and press Review order. Check the price, the fee and the total.Open Broker",
      "Place the order to confirm it. It counts once it fills, and it is saved to your account.",
    ]);
    const open = vi.spyOn(store.getState(), "open");
    await act(async () => { q("pf-guide-open-broker")!.click(); });
    await act(async () => { q("pf-guide-open-wire")!.click(); });
    expect(open.mock.calls.map((c) => c[0])).toEqual(["broker", "wire"]);
    expect(q("pf-goal")!.dataset.stage).toBe("start"); // a click is not a trade
    expect(el.querySelectorAll("button").length).toBe(3); // Open Wire, Open Broker, Hide: nothing that places or confirms
  });

  it("desktop: Open Broker brings the Broker already on this workspace to the front instead of stacking a second one", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setViewport(1440, 900);
    store.getState().open("broker");
    store.getState().open("wire");
    await mountGuide(me(), "acc_a", store);
    const open = vi.spyOn(store.getState(), "open");
    await act(async () => { q("pf-guide-open-broker")!.click(); });
    expect(open).not.toHaveBeenCalled();
    const ws = store.getState().local.windows;
    expect(ws.filter((w) => w.app === "broker")).toHaveLength(1);
    expect(ws.at(-1)!.app).toBe("broker");
  });

  it("Broker's goal entry (desktop without Portfolio): names the goal, no figures; its button un-hides the guide for this account and brings Portfolio up", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setViewport(1200, 768);
    window.localStorage.setItem(hiddenKey("acc_a"), "1");
    window.localStorage.setItem(hiddenKey("acc_b"), "1");
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(GoalEntry, { accountId: "acc_a", locale: "en" }))); });
    expect(q("br-goal-line")!.textContent).toBe("Your goal Grow your $10,000 to $20,000 (Hustler).");
    expect(q("br-goal")!.textContent).not.toMatch(/\d+\.\d\d/); // names the target only; the saved NW is Portfolio's
    expect(q("br-goal-open")!.tagName).toBe("BUTTON");
    expect(q("br-goal-open")!.textContent).toBe("Open first-trade guide");
    const before = store.getState().local.windows.filter((w) => w.app === "portfolio").length;
    await act(async () => { q("br-goal-open")!.click(); });
    expect(window.localStorage.getItem(hiddenKey("acc_a"))).toBeNull();
    expect(window.localStorage.getItem(hiddenKey("acc_b"))).toBe("1");
    const ws = store.getState().local.windows;
    expect(ws.filter((w) => w.app === "portfolio")).toHaveLength(before + 1);
    expect(ws.at(-1)!.app).toBe("portfolio");
  });

  it("opening the guide still focuses #pf-goal-h after the Broker entry unmounts; leftover retries do not throw once document is gone", async () => {
    vi.useFakeTimers();
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setViewport(1200, 768);
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(GoalEntry, { accountId: "acc_a", locale: "en" }))); });
    await act(async () => { q("br-goal-open")!.click(); });
    // Mid-width Trade layout: opening Portfolio takes Broker (and this entry) off the screen.
    await act(async () => root.unmount());
    const win = document.createElement("div");
    win.setAttribute("data-testid", "win-portfolio");
    const h = document.createElement("h2");
    h.id = "pf-goal-h";
    h.tabIndex = -1;
    win.append(h);
    document.body.append(win);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(document.activeElement).toBe(h);
    win.remove();

    root = createRoot(el);
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(GoalEntry, { accountId: "acc_a", locale: "en" }))); });
    await act(async () => { q("br-goal-open")!.click(); });
    await act(async () => root.unmount());
    const desc = Object.getOwnPropertyDescriptor(globalThis, "document");
    try {
      Reflect.deleteProperty(globalThis, "document");
      await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    } finally {
      if (desc) Object.defineProperty(globalThis, "document", desc);
    }
  });

  it("an open order waits; a fill shows done with the Portfolio fill words; below start says prices can fall", async () => {
    await mountGuide(me({ orders: { o1: {} as never } }));
    expect(q("pf-guide-waiting")!.textContent).toBe("You have an open order. It counts once it fills.");
    await mountGuide(me({ nw: "9950.10", fills: [fill], positions: { HALC: {} as never } }));
    expect(q("pf-goal")!.dataset.stage).toBe("done");
    expect(q("pf-guide-fill")!.textContent).toBe("Bought 5 HALC at 98.12 · fee 0.49 FDL.");
    expect(q("pf-guide-steps")).toBeNull();
    expect(q("pf-goal-now")!.textContent).toBe("Saved net worth now $9,950.10 of $20,000.00 · Below your $10,000 start. Prices can fall.");
  });

  it("Hide / Show is saved per account on this device; another account still sees the guide; the goal stays", async () => {
    await mountGuide(me(), "acc_a");
    await act(async () => { q("pf-guide-hide")!.click(); });
    expect(q("pf-guide")).toBeNull();
    expect(q("pf-goal-line")).not.toBeNull();
    expect(window.localStorage.getItem(hiddenKey("acc_a"))).toBe("1");
    await act(async () => root.unmount()); root = createRoot(el);
    await mountGuide(me(), "acc_a");
    expect(q("pf-guide")).toBeNull();
    expect(q("pf-guide-show")).not.toBeNull();
    await mountGuide(me(), "acc_b");
    expect(q("pf-guide")).not.toBeNull();
    await mountGuide(me(), "acc_a");
    await act(async () => { q("pf-guide-show")!.click(); });
    expect(q("pf-guide")).not.toBeNull();
    expect(window.localStorage.getItem(hiddenKey("acc_a"))).toBeNull();
  });

  it("Overview: a guest gets the start + goal sentence and no guide (the example portfolio is not theirs)", async () => {
    vi.spyOn(authSession, "useAuthSession").mockReturnValue({ status: "signed_out" });
    vi.useFakeTimers();
    const store = createShellStore(mockChannels(new URLSearchParams()));
    setFeed(new MockFeed({ nw: "412860.15" }, { tickMs: 1000 }));
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(Overview, { phone: false }))); });
    await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
    expect(q("pf-goal-guest")!.textContent).toBe("Sign in to start with $10,000 in game money and a goal of $20,000.");
    expect(q("pf-goal")).toBeNull();
  });

  it("Overview signed in: no goal while `me` loads or fails; with the server ledger, the goal at the server NW", async () => {
    vi.spyOn(authSession, "useAuthSession").mockReturnValue(signedIn("acc_pf"));
    vi.useFakeTimers();
    let fail = true;
    const ok = portAvalonServer({ cashCents: 1_000_000 });
    vi.stubGlobal("fetch", vi.fn((u: RequestInfo | URL, i?: RequestInit) => (fail && String(u).endsWith("/api/broker/me") ? Promise.resolve(new Response("{}", { status: 500 })) : ok(u, i))));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_pf");
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(Overview, { phone: false }))); });
    expect(q("pf-goal")).toBeNull(); // loading
    await serverHalfLoaded();
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); });
    expect(q("pf-overview")!.dataset.state).toBe("error");
    expect(q("pf-goal")).toBeNull();
    expect(q("pf-goal-guest")).toBeNull();
    fail = false;
    await act(async () => { q("pf-retry")!.click(); });
    for (let i = 0; i < 20 && !q("pf-goal"); i++) await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(q("pf-goal-now")!.textContent).toBe("Saved net worth now $10,000.00 of $20,000.00");
  });
});

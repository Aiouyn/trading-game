// @vitest-environment happy-dom
// Card 41 (fail-first, docs/v1/units/buy-ack-after-leave.md): on phone the Broker ticket unmounts when the player opens
// another app. A Place whose reply lands after that must still show its ack ("Bought N X at P") once, and a ticket that
// stays mounted must still show it exactly once (no second copy from an app-level surface).
// 17 §3.5 (17-UX:445) "filled (toast)"; §3.10.1 (17-UX:568) fill -> toast; §3.10.2 (17-UX:581) phone: one at a time.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import { resetTicketPrefill } from "@/apps/broker/ticketPrefill";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { ShellCtx } from "@/components/shell/ShellContext";
import { authSession } from "@/shell/authSession";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { intentLog } from "@/shell/intentLog";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";
import type { MeTradingBody } from "@/shell/contracts/channels";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPLY_MS = 4000;
// Card 41 modules, imported by name so this file still loads (and goes red) on a base without them.
const PLACED_ACKS = "@/apps/broker/placedAcks";
const FILL_ACK_TOASTS = "@/apps/broker/FillAckToasts";
const BOUGHT_5 = /Bought 5 HALC at \d/g;

describe("card 41 a buy's ack survives leaving the ticket mid-Place (phone)", () => {
  let el: HTMLDivElement, root: Root, store: ShellStore, feed: MockFeed;
  // The toast chunk is a dynamic import that resolves on the real clock; warm it so fake time cannot outrun it (a
  // browser fetches it when the Place is noted, seconds before any reply). Absent before the fix: ignored.
  beforeAll(async () => { await import(/* @vite-ignore */ FILL_ACK_TOASTS).catch(() => {}); });
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    authSession._resetForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    resetTicketPrefill();
    feed = new MockFeed({ replyMs: REPLY_MS }, { tickMs: 1000 });
    setFeed(feed);
    store = createShellStore(defaultChannels());
    store.setState({ vw: 390, vh: 844 });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    // A toast still showing when a test ends must not leak into the next test (module store; a reload clears it).
    await (import(/* @vite-ignore */ PLACED_ACKS) as Promise<{ resetPlacedAcks(): void }>).then((m) => m.resetPlacedAcks(), () => {});
    el.remove();
    setFeed(null);
    resetTicketPrefill();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  /** Every "Bought 5 HALC at …" the player can read anywhere on the page (ticket, sheet, toast, status bar). */
  const boughtCount = () => (document.body.textContent ?? "").match(BOUGHT_5)?.length ?? 0;
  async function until(pred: () => boolean, ms = 10_000) {
    for (let t = 0; t < ms && !pred(); t += 50) await wait(50);
    return pred();
  }
  async function typeQty(value: string) {
    const input = q("br-qty") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await wait(PREVIEW_DEBOUNCE_MS + 50);
  }

  /** Phone Broker on HALC: Buy 5, Review, Place. Returns with the reply still held by the order door. */
  const halcBuys5 = () => (feed.body("me") as MeTradingBody).fills.filter((f) => f.assetId === "HALC" && f.side === "BUY" && f.qty === "5").length;

  async function placeBuy5() {
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome))); });
    await wait(SNAP_DELAY_MS + 20);
    await act(async () => { store.getState().open("broker", "HALC", { deepLink: true }); });
    expect(await until(() => q("broker")?.getAttribute("data-state") === "live")).toBe(true);
    await click(q("br-side-buy")!);
    await typeQty("5");
    expect(await until(() => q("br-review") !== null && !(q("br-review") as HTMLButtonElement).disabled)).toBe(true);
    await click(q("br-review")!);
    expect(await until(() => q("br-place") !== null && !(q("br-place") as HTMLButtonElement).disabled)).toBe(true);
    const before = intentLog().length;
    await click(q("br-place")!);
    expect(intentLog().length).toBe(before + 1); // the intent is sent: the order door holds only the reply
    expect(q("broker")!.getAttribute("data-phase")).toBe("submitting");
    expect(boughtCount()).toBe(0);
  }

  it("A: the ticket unmounts mid-Place (open Portfolio); after the fill and the reply, 'Bought 5 HALC at …' is visible exactly once", async () => {
    await placeBuy5();
    await act(async () => { store.getState().open("portfolio"); });
    await wait(50);
    expect(q("broker")).toBeNull(); // the ticket is gone: only Portfolio is mounted on phone
    // The order door answers after REPLY_MS; the mock feed ticks every second, so the fill is on `me` by then too.
    await wait(REPLY_MS + 2500);
    expect(halcBuys5()).toBe(1); // the order went through: one BUY 5 HALC fill on `me`
    expect(boughtCount()).toBe(1);
    // and it stays once: later ticks do not repeat it
    await wait(2000);
    expect(boughtCount()).toBeLessThanOrEqual(1);
  });

  it("B: the ticket stays mounted; 'Bought 5 HALC at …' is shown exactly once (the ticket's ack, no duplicate)", async () => {
    await placeBuy5();
    await wait(REPLY_MS + 2500);
    expect(halcBuys5()).toBe(1);
    expect(q("br-ack")).not.toBeNull();
    expect(q("br-ack-title")!.textContent).toMatch(/^Bought 5 HALC at \d/);
    expect(boughtCount()).toBe(1);
    await wait(2000);
    expect(boughtCount()).toBe(1);
  });
});

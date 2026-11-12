// @vitest-environment happy-dom
// Card 41 guards (Gatekeeper on the plan): outcome copy for rejected / failed / expired intents left behind by an
// unmounted ticket, one toast per intent (not per poll), no double when the player returns to the Broker before the
// result, phone queue (one at a time), Esc dismisses, and a mounted ticket's failure is never repeated by a toast.
// 17 §3.5 (17-UX:445) "rejected (toast with reason)"; §3.10.2 (17-UX:581) 4000 ms, Esc, phone one at a time; 17-UX:661
// fills are assertive.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import { resetTicketPrefill } from "@/apps/broker/ticketPrefill";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { ShellCtx } from "@/components/shell/ShellContext";
import { authSession } from "@/shell/authSession";
import type { OrderDraft } from "@/shell/contracts/channels";
import { MockFeed, SNAP_DELAY_MS, type Scenario } from "@/shell/contracts/mockFeed";
import { IntentOutcomeUnknown } from "@/shell/contracts/network";
import { setFeed } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPLY_MS = 4000;
const TOAST_MS = 4000; // PARAM.ui_toast_ms
const NO_ANSWER = "No answer from the server. This order may have gone through.";

describe("card 41 guards: what an unmounted ticket's intent shows, and only once (phone)", () => {
  let el: HTMLDivElement, root: Root, store: ShellStore, feed: MockFeed;
  function boot(scenario: Partial<Scenario> = {}) {
    feed = new MockFeed({ replyMs: REPLY_MS, ...scenario }, { tickMs: 1000 });
    setFeed(feed);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    authSession._resetForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    resetTicketPrefill();
    store = createShellStore(defaultChannels());
    store.setState({ vw: 390, vh: 844 });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    resetTicketPrefill();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const count = (re: RegExp | string) => {
    const text = document.body.textContent ?? "";
    if (typeof re === "string") return text.split(re).length - 1;
    return text.match(new RegExp(re.source, "g"))?.length ?? 0;
  };
  async function until(pred: () => boolean, ms = 10_000) {
    for (let t = 0; t < ms && !pred(); t += 50) await wait(50);
    return pred();
  }
  /** Samples `count(re)` every 100 ms for `ms`: the max seen at once, and how many times it rose from 0 (appearances). */
  async function watch(re: RegExp | string, ms: number) {
    let max = 0, rises = 0, prev = count(re);
    if (prev > 0) rises = 1;
    for (let t = 0; t < ms; t += 100) {
      await wait(100);
      const n = count(re);
      max = Math.max(max, n);
      if (prev === 0 && n > 0) rises += 1;
      prev = n;
    }
    return { max, rises };
  }
  async function render() {
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome))); });
    await wait(SNAP_DELAY_MS + 20);
  }
  async function typeQty(value: string) {
    const input = q("br-qty") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await wait(PREVIEW_DEBOUNCE_MS + 50);
  }
  /** Phone Broker on `asset`: side + qty, Review, Place. Returns with the reply still held by the order door. */
  async function place(asset: string, side: "buy" | "sell", qty: string) {
    await act(async () => { store.getState().open("broker", asset, { deepLink: true }); });
    expect(await until(() => q("broker")?.getAttribute("data-state") === "live")).toBe(true);
    await click(q(`br-side-${side}`)!);
    await typeQty(qty);
    expect(await until(() => q("br-review") !== null && !(q("br-review") as HTMLButtonElement).disabled)).toBe(true);
    await click(q("br-review")!);
    expect(await until(() => q("br-place") !== null && !(q("br-place") as HTMLButtonElement).disabled)).toBe(true);
    await click(q("br-place")!);
    expect(q("broker")!.getAttribute("data-phase")).toBe("submitting");
  }
  async function leave() {
    await act(async () => { store.getState().open("portfolio"); });
    await wait(50);
    expect(q("broker")).toBeNull();
  }
  /** The order door's submit, replaced: `fn` gets the real submit and decides the reply. */
  function door(fn: (real: (d: OrderDraft) => string | Promise<string>, d: OrderDraft) => Promise<string>) {
    const orig = feed.orderDoor.bind(feed);
    vi.spyOn(feed, "orderDoor").mockImplementation(() => {
      const d = orig();
      return { ...d, submit: (x: OrderDraft) => fn((y) => feed.submit(y), x) };
    });
  }

  it("2a rejected: the toast says 'Order rejected' with the reason, never 'Bought', once", async () => {
    boot({ reject: "MKT_INSUFFICIENT_BP" });
    await render();
    await place("HALC", "buy", "5");
    await leave();
    expect(await until(() => count("Order rejected") > 0, REPLY_MS + 3000)).toBe(true);
    expect(count("Order rejected")).toBe(1);
    expect(count("Not enough cash for this order.")).toBe(1); // the AckPanel reason line
    expect(count(/Bought 5 HALC/)).toBe(0);
    const after = await watch("Order rejected", TOAST_MS + 6000);
    expect(after.max).toBe(1);
    expect(after.rises).toBe(0);
    expect(count(/Bought 5 HALC/)).toBe(0);
  });

  it("2b failed (no answer): the toast says the order may have gone through, never 'Bought', once", async () => {
    boot();
    door(() => new Promise((_, rej) => setTimeout(() => rej(new IntentOutcomeUnknown()), REPLY_MS)));
    await render();
    await place("HALC", "buy", "5");
    await leave();
    const seen = await watch(NO_ANSWER, REPLY_MS + 3000);
    expect(seen.rises).toBe(1);
    expect(seen.max).toBe(1);
    expect(count(/Bought 5 HALC/)).toBe(0);
  });

  it("2c expired (accepted id never lands on `me`): after the wait the toast says no answer, never 'Bought', once", async () => {
    boot();
    door(() => new Promise((r) => setTimeout(() => r("i-ghost-never-on-me"), REPLY_MS)));
    await render();
    await place("HALC", "buy", "5");
    await leave();
    const seen = await watch(NO_ANSWER, 70_000);
    expect(seen.rises).toBe(1);
    expect(seen.max).toBe(1);
    expect(count(/Bought 5 HALC/)).toBe(0);
  });

  it("2d one toast per intent: it shows once across many polls, is assertive, and goes after 4000 ms", async () => {
    boot();
    await render();
    await place("HALC", "buy", "5");
    await leave();
    expect(await until(() => count(/Bought 5 HALC at \d/) === 1, REPLY_MS + 3000)).toBe(true);
    const node = [...document.body.querySelectorAll("*")].find((n) => n.children.length === 0 && /Bought 5 HALC at \d/.test(n.textContent ?? ""))!;
    expect(node.closest('[aria-live="assertive"]')).not.toBeNull();
    expect(node.closest('[role="status"]')).not.toBeNull();
    const after = await watch(/Bought 5 HALC at \d/, TOAST_MS + 8000); // ~12 more mock ticks
    expect(after.max).toBe(1);
    expect(after.rises).toBe(0); // never a second appearance
    expect(count(/Bought 5 HALC at \d/)).toBe(0); // gone after its 4000 ms
  });

  it("2e Esc dismisses the toast", async () => {
    boot();
    await render();
    await place("HALC", "buy", "5");
    await leave();
    expect(await until(() => count(/Bought 5 HALC at \d/) === 1, REPLY_MS + 3000)).toBe(true);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await wait(50);
    expect(count(/Bought 5 HALC at \d/)).toBe(0);
  });

  it("3 leave mid-Place, return to the Broker before the result: exactly one ack in total (panel or toast)", async () => {
    boot();
    await render();
    await place("HALC", "buy", "5");
    await leave();
    await act(async () => { store.getState().open("broker", "HALC", { deepLink: true }); });
    expect(await until(() => q("broker")?.getAttribute("data-state") === "live")).toBe(true);
    const seen = await watch(/Bought 5 HALC at \d/, REPLY_MS + 3000);
    expect(seen.rises).toBe(1);
    expect(seen.max).toBe(1);
  });

  it("4 phone: two orphaned intents queue, one toast at a time, both shown", async () => {
    boot();
    await render();
    await place("HALC", "buy", "5");
    await leave();
    await place("MRDN", "buy", "3");
    await leave();
    let both = 0, halc = 0, mrdn = 0;
    for (let t = 0; t < REPLY_MS + 2 * TOAST_MS + 4000; t += 100) {
      await wait(100);
      const h = count(/Bought 5 HALC at \d/), m = count(/Bought 3 MRDN at \d/);
      if (h && m) both += 1;
      halc = Math.max(halc, h); mrdn = Math.max(mrdn, m);
    }
    expect(halc).toBe(1);
    expect(mrdn).toBe(1);
    expect(both).toBe(0);
  });

  it("guard: a mounted ticket's own failure is shown once by the ticket, no toast copy on top", async () => {
    boot();
    door(() => new Promise((_, rej) => setTimeout(() => rej(new IntentOutcomeUnknown()), REPLY_MS)));
    await render();
    await place("HALC", "buy", "5");
    const seen = await watch(NO_ANSWER, REPLY_MS + TOAST_MS + 2000);
    expect(seen.max).toBe(1);
    expect(q("br-place-failed")).not.toBeNull();
  });

  it("guard: a mounted ticket's reject is shown once by the ticket's ack panel, no toast copy on top", async () => {
    boot({ reject: "MKT_INSUFFICIENT_BP" });
    await render();
    await place("HALC", "buy", "5");
    const seen = await watch("Order rejected", REPLY_MS + TOAST_MS + 2000);
    expect(seen.max).toBe(1);
    expect(q("br-ack")?.getAttribute("data-status")).toBe("REJECTED");
  });
});

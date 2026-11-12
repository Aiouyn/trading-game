// @vitest-environment happy-dom
// Card 19 (playtest #4): while the server is gone after prices were live (system.connection = "reconnecting"),
// Review order and Place order are disabled and say why, in the ticket's language. Gatekeeper (a): a ticket already in
// Review cannot be placed during the outage; after recovery it re-prices from the fresh tick and one Place sends one order.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import { BR_STRINGS } from "@/apps/broker/strings";
import type { OrderDraft, PreviewRes } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { LiveMarket } from "@/server/market/clock";
import { MANUAL_TICK_MS, click, mount, q, setup, teardown, tick, typeQty, wait, type Harness } from "./br-harness";

let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

class SpyFeed extends MockFeed {
  submits: OrderDraft[] = [];
  previews: PreviewRes[] = [];
  constructor() { super({}, { tickMs: MANUAL_TICK_MS }); }
  override submit(d: OrderDraft): string { this.submits.push({ ...d }); return super.submit(d); }
  override preview(d: OrderDraft): PreviewRes { const r = super.preview(d); this.previews.push(r); return r; }
}
const setConnection = (connection: "live" | "reconnecting") => act(async () => {
  const c = h.store.getState().channels;
  h.store.getState().setChannels({ ...c, system: { ...c.system, connection } });
});
const isDisabled = (n: HTMLElement) => n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";

describe.each(["en", "fr"] as const)("Review reason during an outage (%s)", (locale) => {
  const t = BR_STRINGS[locale];
  it("disables Review with a visible, linked reason, and clears both on recovery", async () => {
    await mount(h, { context: "HALC", locale });
    await typeQty(h, "40");
    await wait(PREVIEW_DEBOUNCE_MS);
    const review = () => q(h, "br-review")!;
    expect(isDisabled(review())).toBe(false);
    expect(q(h, "br-review-reason")).toBeNull();

    await setConnection("reconnecting");
    expect(isDisabled(review())).toBe(true);
    const reason = q(h, "br-review-reason")!;
    expect(reason.textContent).toBe(t.reviewWaitConnection);
    expect(review().getAttribute("aria-describedby")).toBe(reason.id);

    await setConnection("live");
    expect(isDisabled(review())).toBe(false);
    expect(q(h, "br-review-reason")).toBeNull();
    expect(review().getAttribute("aria-describedby")).toBeNull();
  });
});

describe("(a) a ticket in Review across an outage", () => {
  it("cannot be placed while reconnecting; after recovery it re-prices at the fresh tick and one Place sends one order", async () => {
    const f = new SpyFeed();
    await mount(h, { context: "HALC", feed: f });
    await typeQty(h, "40");
    await wait(PREVIEW_DEBOUNCE_MS);
    await click(q(h, "br-review")!);
    expect(q(h, "broker")!.dataset.phase).toBe("review");
    const place = () => q(h, "br-place")!;
    expect(isDisabled(place())).toBe(false);

    await setConnection("reconnecting");
    expect(isDisabled(place())).toBe(true);
    expect(q(h, "br-place-reason")!.textContent).toBe(BR_STRINGS.en.placeWaitConnection);
    expect(place().getAttribute("aria-describedby")).toBe(q(h, "br-place-reason")!.id);
    await click(place());
    expect(f.submits).toHaveLength(0);

    // Recovery: the flag clears and a fresh server tick lands. Place waits for a preview priced at that tick.
    await setConnection("live");
    await tick(f);
    const fresh = f.tick;
    await wait(0);
    expect(f.previews.at(-1)!.computedAtTick).toBe(fresh);
    expect(q(h, "br-place-reason")).toBeNull();
    expect(isDisabled(place())).toBe(false);
    await click(place());
    await click(place());
    await wait(0);
    expect(f.submits).toHaveLength(1);
    expect(f.submits[0]!.qty).toBe("40");
  });
});

// Card 24 (Gatekeeper qual 1 on 83f2d909): a server restart lands back on boot tick 27700, so the adopt after a
// reconnect can carry the SAME or a LOWER tick than the estimate on screen. That estimate must still be re-priced.
// Healthy polls that adopt an unchanged tick must not re-price (no flicker).
describe("card 24: Review estimate after a reconnect", () => {
  /** An /api/market snapshot at `tick`, with HALC moved to `halcLast` (a restarted server's book). */
  function snapAt(tick: number, halcLast?: string) {
    const snap = new LiveMarket().snapshot() as { tick: number; quotes: { tick?: number; rows: Record<string, { last: string }> } };
    snap.tick = tick;
    if (typeof snap.quotes.tick === "number") snap.quotes.tick = tick;
    if (halcLast) snap.quotes.rows.HALC!.last = halcLast;
    return snap;
  }
  const est = () => q(h, "br-review-block")!.textContent ?? "";
  async function inReview(f: SpyFeed) {
    await mount(h, { context: "HALC", feed: f });
    await typeQty(h, "40");
    await wait(PREVIEW_DEBOUNCE_MS);
    await click(q(h, "br-review")!);
    expect(q(h, "broker")!.dataset.phase).toBe("review");
    expect(isDisabled(q(h, "br-place")!)).toBe(false);
  }
  /** Outage, then the first good read adopts `snap`; the feed flips the flag to live inside that adopt. */
  async function reconnectTo(f: SpyFeed, snap: unknown) {
    await setConnection("reconnecting");
    await act(async () => {
      expect(f.adoptAuthoritativeQuotes(snap)).toBe(true);
      const c = h.store.getState().channels;
      h.store.getState().setChannels({ ...c, system: { ...c.system, connection: "live" } });
    });
    await wait(0);
  }
  async function placeOnce(f: SpyFeed) {
    const place = q(h, "br-place")!;
    await click(place);
    await click(place);
    await act(async () => { place.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
    await wait(0);
    expect(f.submits).toHaveLength(1);
  }

  it("same tick: a reconnect→live adopt at the review's own tick re-prices the estimate before Place", async () => {
    const f = new SpyFeed();
    await inReview(f);
    const t0 = f.previews.at(-1)!.computedAtTick;
    const before = f.previews.at(-1)!.price;
    const asked = f.previews.length;
    await reconnectTo(f, snapAt(t0, "45.00"));
    expect(f.tick).toBe(t0);
    expect(f.previews.length, "asked again after the reconnect").toBeGreaterThan(asked);
    const fresh = f.previews.at(-1)!;
    expect(fresh.computedAtTick).toBe(t0);
    expect(fresh.price).toBe("45.00");
    expect(fresh.price).not.toBe(before);
    expect(est()).toContain("45.00");
    expect(est()).not.toContain(before);
    expect(isDisabled(q(h, "br-place")!)).toBe(false);
    await placeOnce(f);
  });

  it("lower tick: a restart that adopts an older tick still re-prices (computedAtTick > tickerTick is not 'fresh')", async () => {
    const f = new SpyFeed();
    await mount(h, { context: "HALC", feed: f });
    const boot = f.tick;
    await tick(f);
    await typeQty(h, "40");
    await wait(PREVIEW_DEBOUNCE_MS);
    await click(q(h, "br-review")!);
    expect(f.previews.at(-1)!.computedAtTick).toBe(boot + 1);
    await reconnectTo(f, snapAt(boot, "44.00"));
    expect(f.tick).toBe(boot);
    const fresh = f.previews.at(-1)!;
    expect(fresh.computedAtTick).toBe(boot);
    expect(fresh.price).toBe("44.00");
    expect(est()).toContain("44.00");
    expect(est()).toContain(String(boot));
    await placeOnce(f);
  });

  it("no flicker: healthy 1 s polls adopting an unchanged tick leave the estimate and computedAtTick untouched", async () => {
    const f = new SpyFeed();
    await inReview(f);
    const shown = est();
    const first = f.previews.at(-1)!;
    const asked = f.previews.length;
    for (let i = 0; i < 5; i++) {
      await act(async () => { expect(f.adoptAuthoritativeQuotes(snapAt(f.tick))).toBe(true); });
      await wait(1000);
      expect(f.previews.length, `poll ${i + 1} asked for no new preview`).toBe(asked);
      expect(est()).toBe(shown);
      expect(q(h, "br-refreshing")).toBeNull();
      expect(isDisabled(q(h, "br-place")!)).toBe(false);
    }
    expect(f.previews.at(-1)!.computedAtTick).toBe(first.computedAtTick);
    expect(h.store.getState().channels.system.connection).toBe("live");
  });
});

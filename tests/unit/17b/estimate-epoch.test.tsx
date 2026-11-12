// @vitest-environment happy-dom
// Card 39: after a reconnect the Review epoch bumps, and Place stays disabled until the
// re-asked estimate (new epoch) lands, even when the adopted tick equals the estimate
// already on screen (computedAtTick < tickerTick is false).
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import type { OrderDraft, PreviewRes } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { LiveMarket } from "@/server/market/clock";
import { MANUAL_TICK_MS, click, mount, q, setup, teardown, typeQty, wait, type Harness } from "./br-harness";

let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

class HoldFeed extends MockFeed {
  submits: OrderDraft[] = [];
  previews: PreviewRes[] = [];
  hold = false;
  pending = 0;
  private queued: Array<{ draft: OrderDraft; resolve: (r: PreviewRes) => void }> = [];
  constructor() { super({}, { tickMs: MANUAL_TICK_MS }); }
  override submit(d: OrderDraft): string { this.submits.push({ ...d }); return super.submit(d); }
  override preview(d: OrderDraft): PreviewRes {
    const r = super.preview(d);
    this.previews.push(r);
    return r;
  }
  override orderDoor() {
    const door = super.orderDoor();
    return {
      ...door,
      preview: (d: OrderDraft) => {
        if (!this.hold) return this.preview(d);
        this.pending += 1;
        return new Promise<PreviewRes>((resolve) => { this.queued.push({ draft: d, resolve }); });
      },
    };
  }
  async release() {
    const queued = this.queued.splice(0);
    this.pending = 0;
    for (const p of queued) p.resolve(this.preview(p.draft));
    await act(async () => { await Promise.resolve(); });
  }
}

const setConnection = (connection: "live" | "reconnecting") => act(async () => {
  const c = h.store.getState().channels;
  h.store.getState().setChannels({ ...c, system: { ...c.system, connection } });
});
const isDisabled = (n: HTMLElement) => n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";

function snapAt(tick: number) {
  const snap = new LiveMarket().snapshot() as { tick: number; quotes: { tick?: number; rows: Record<string, { last: string }> } };
  snap.tick = tick;
  if (typeof snap.quotes.tick === "number") snap.quotes.tick = tick;
  return snap;
}

describe("card 39: Place waits for the new-epoch estimate", () => {
  it("after a same-tick reconnect, Place stays disabled until the re-asked estimate lands, then is enabled", async () => {
    const f = new HoldFeed();
    await mount(h, { context: "HALC", feed: f });
    await typeQty(h, "40");
    await wait(PREVIEW_DEBOUNCE_MS);
    await click(q(h, "br-review")!);
    expect(q(h, "broker")!.dataset.phase).toBe("review");
    const place = () => q(h, "br-place")!;
    expect(isDisabled(place())).toBe(false);
    const t0 = f.previews.at(-1)!.computedAtTick;
    const asked = f.previews.length;

    f.hold = true;
    await setConnection("reconnecting");
    expect(isDisabled(place())).toBe(true);

    await act(async () => {
      expect((await f.serverSync()).adoptAuthoritativeQuotes(snapAt(t0))).toBe(true);
      const c = h.store.getState().channels;
      h.store.getState().setChannels({ ...c, system: { ...c.system, connection: "live" } });
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await wait(0);

    // Live again, at the same tick as the estimate already on screen. Only the
    // epoch clause should keep Place disabled while the re-ask is in flight.
    expect(f.tick).toBe(t0);
    expect(h.store.getState().channels.system.connection).toBe("live");
    expect(f.pending, "a re-asked preview is in flight").toBeGreaterThan(0);
    expect(f.previews.length, "re-asked preview has not landed yet").toBe(asked);
    expect(isDisabled(place())).toBe(true);
    expect(q(h, "br-refreshing")?.textContent).toBeTruthy();

    await f.release();
    expect(f.previews.length).toBeGreaterThan(asked);
    expect(f.previews.at(-1)!.computedAtTick).toBe(t0);
    expect(isDisabled(place())).toBe(false);
    expect(q(h, "br-refreshing")).toBeNull();
  }, 20_000);
});

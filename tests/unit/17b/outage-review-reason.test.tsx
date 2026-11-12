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
    expect(q(h, "br-place-reason")!.textContent).toBe(BR_STRINGS.en.reviewWaitConnection);
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

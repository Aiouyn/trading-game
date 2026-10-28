// @vitest-environment happy-dom
// QA #85 carry-over Q1 (folded into card 6): the preview is keyed on the stop and limit prices too. Review stays
// disabled ("Refreshing estimate…") until a preview for the current inputs lands: during the 300 ms debounce and when
// the 5-per-tick budget (19 Rule 3.8.5) refused the request, which is then sent on the next tick.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_PREVIEWS_PER_TICK, PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import { BR_STRINGS } from "@/apps/broker/strings";
import type { OrderDraft, PreviewRes } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { MANUAL_TICK_MS, click, mount, q, setup, teardown, text, tick, typeInto, wait, type Harness } from "./br-harness";

const EN = BR_STRINGS.en;
let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

/** Records every preview the ticket asks for. */
class SpyFeed extends MockFeed {
  asked: OrderDraft[] = [];
  constructor() { super({}, { tickMs: MANUAL_TICK_MS }); }
  override preview(d: OrderDraft): PreviewRes { this.asked.push({ ...d }); return super.preview(d); }
}
const review = () => q(h, "br-review")!;
const disabled = () => review().getAttribute("aria-disabled") === "true";
const priceBox = (f: "limit" | "stop") => q(h, `br-price-${f}`)!;

async function limitTicket(f: SpyFeed, qty = "40", limit = "42.10") {
  await mount(h, { context: "HALC", feed: f });
  await click(q(h, "br-type-limit")!);
  await typeInto(q(h, "br-qty")!, qty);
  await typeInto(priceBox("limit"), limit);
  await wait(PREVIEW_DEBOUNCE_MS);
}

describe("Q1 preview key includes the prices", () => {
  it("editing the limit disables Review through the debounce; the new preview carries the new limit", async () => {
    const f = new SpyFeed();
    await limitTicket(f);
    expect(disabled()).toBe(false);
    expect(f.asked.at(-1)!.limit).toBe("42.10");
    await typeInto(priceBox("limit"), "41.50");
    expect(disabled(), "old preview is for 42.10").toBe(true);
    expect(text(h, "br-est-pending")).toBe(EN.refreshing);
    expect(q(h, "br-est")).toBeNull();
    await wait(PREVIEW_DEBOUNCE_MS - 1);
    expect(disabled()).toBe(true);
    await wait(1);
    expect(f.asked.at(-1)!.limit).toBe("41.50");
    expect(disabled()).toBe(false);
    expect(q(h, "br-est-pending")).toBeNull();
    await click(review());
    expect(q(h, "broker")!.dataset.phase).toBe("review");
  });
  it("editing the stop of a stop limit does the same", async () => {
    const f = new SpyFeed();
    await mount(h, { context: "HALC", feed: f });
    await click(q(h, "br-type-stop_limit")!);
    await typeInto(q(h, "br-qty")!, "40");
    await typeInto(priceBox("stop"), "40.00");
    await typeInto(priceBox("limit"), "42.10");
    await wait(PREVIEW_DEBOUNCE_MS);
    expect(disabled()).toBe(false);
    await typeInto(priceBox("stop"), "40.50");
    expect(disabled()).toBe(true);
    await wait(PREVIEW_DEBOUNCE_MS);
    expect(f.asked.at(-1)).toMatchObject({ stop: "40.50", limit: "42.10" });
    expect(disabled()).toBe(false);
  });
  it("past the per-tick cap: Review stays disabled and pending; the next tick sends the current draft", async () => {
    const f = new SpyFeed();
    await limitTicket(f, "40", "40.00");
    const prices = ["40.10", "40.20", "40.30", "40.40", "40.50", "40.60"];
    for (const p of prices) { await typeInto(priceBox("limit"), p); await wait(PREVIEW_DEBOUNCE_MS); }
    expect(f.asked.length, "the budget caps the tick").toBe(MAX_PREVIEWS_PER_TICK);
    expect(f.asked.at(-1)!.limit).not.toBe("40.60");
    expect(disabled(), "the last shown preview is for an older limit").toBe(true);
    expect(text(h, "br-est-pending")).toBe(EN.refreshing);
    await wait(PREVIEW_DEBOUNCE_MS * 10);
    expect(disabled(), "no tick, no preview, still disabled").toBe(true);
    await tick(f);
    expect(f.asked.at(-1)!.limit).toBe("40.60");
    expect(disabled()).toBe(false);
  });
});

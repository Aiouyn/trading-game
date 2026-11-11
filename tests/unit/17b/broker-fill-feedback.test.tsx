// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { meBody } from "@/shell/contracts/schema";
import { decText } from "@/apps/portfolio/positions/format";
import { speakMoney } from "@/components/shell/MoneyText";
import { click, mount, q, setup, teardown, text, tick, typeQty, type Harness } from "./br-harness";
let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });
describe("Card7 first-fill position context", () => {
  it("shows the ledger quantity and unrealized P&L only after the fill, outside the receipt live region", async () => {
    const feed = await mount(h, { context: "HALC" });
    expect(q(h, "br-fill-position")).toBeNull();
    await typeQty(h, "3"); await click(q(h, "br-review")!); await click(q(h, "br-place")!);
    expect(q(h, "br-fill-position")).toBeNull();
    await tick(feed);
    const body = meBody(feed.body("me"));
    expect(text(h, "br-fill-holding")).toBe(`Your position: ${decText(body.positions.HALC!.qty, "en")} HALC`);
    expect(q(h, "br-fill-pnl")!.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(speakMoney(body.positions.HALC!.upl));
    expect(q(h, "br-fill-position")!.closest('[role="status"]')).toBeNull();
    expect(text(h, "br-fill-help")).toContain("Portfolio");
    await tick(feed);
    expect(q(h, "br-fill-pnl")!.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(speakMoney((meBody(feed.body("me"))).positions.HALC!.upl));
  });
  it("queued acceptance is not a fill or a P&L claim", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { halt: "HALC" } });
    await typeQty(h, "3"); await click(q(h, "br-review")!); await click(q(h, "br-place")!); await tick(feed);
    expect(q(h, "br-ack")!.dataset.status).toBe("ACCEPTED"); expect(q(h, "br-fill-position")).toBeNull();
  });
  it("a rejected intent has no filled holding context", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { reject: "MKT_INSUFFICIENT_BP" } });
    await typeQty(h, "3"); await click(q(h, "br-review")!); await click(q(h, "br-place")!); await tick(feed);
    expect(q(h, "br-ack")!.dataset.status).toBe("REJECTED"); expect(q(h, "br-fill-position")).toBeNull();
  });
});

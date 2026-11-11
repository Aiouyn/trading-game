// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { intentLog } from "@/shell/intentLog";
import { click, mount, q, setup, teardown, key, tick, typeQty, type Harness } from "./br-harness";

let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

describe("phone Trade entry", () => {
  it("opens the single existing ticket at Quantity without creating an order", async () => {
    await mount(h, { context: "HALC", vw: 390 });
    const before = intentLog().length;
    const trade = q(h, "br-trade");
    expect(trade).not.toBeNull();
    expect(q(h, "br-ticket")).toBeNull();
    await click(trade!);
    expect(q(h, "br-sheet")?.getAttribute("aria-modal")).toBe("true");
    expect(h.el.querySelectorAll('[data-testid="br-ticket"]')).toHaveLength(1);
    expect(document.activeElement).toBe(q(h, "br-qty"));
    expect(intentLog().length).toBe(before);
  });

  it("Escape and backdrop return to Trade; reopening preserves the draft, not a review", async () => {
    await mount(h, { context: "HALC", vw: 390 });
    const trade = q(h, "br-trade")!;
    await click(trade);
    await typeQty(h, "7");
    await click(q(h, "br-review")!);
    expect(q(h, "br-ticket")).toBeNull();
    expect(q(h, "br-sheet")!.contains(document.activeElement)).toBe(true);
    const before = intentLog().length;
    await key(q(h, "br-sheet")!, "Escape");
    expect(q(h, "br-sheet")).toBeNull();
    expect(document.activeElement).toBe(trade);
    await key(q(h, "broker")!, "Enter");
    await key(q(h, "broker")!, "Enter");
    expect(intentLog().length).toBe(before);
    await click(trade);
    expect(q(h, "br-qty")?.getAttribute("value")).toBe("7");
    expect(q(h, "br-place")).toBeNull();
    await click(q(h, "br-sheet-scrim")!);
    expect(q(h, "br-sheet")).toBeNull();
    expect(document.activeElement).toBe(trade);
  });

  it("does not steal focus back from a still-connected input during native blur", async () => {
    const feed = await mount(h, { context: "HALC", vw: 390 });
    const trade = q(h, "br-trade");
    if (!trade) throw new Error("Trade entry missing");
    await click(trade);
    const qty = q(h, "br-qty");
    if (!qty) throw new Error("Quantity missing");
    await act(async () => qty.blur());
    await tick(feed);
    expect(document.activeElement).toBe(document.body);
    const close = q(h, "br-sheet-close");
    if (!close) throw new Error("Close missing");
    await click(close);
    expect(q(h, "br-sheet")).toBeNull();
    expect(document.activeElement).toBe(trade);
  });

  it("refreshes do not steal Close focus; replacing edit/review/ack keeps focus in the one modal", async () => {
    const feed = await mount(h, { context: "HALC", vw: 390 });
    await click(q(h, "br-trade")!);
    await typeQty(h, "3");
    q(h, "br-sheet-close")!.focus();
    await tick(feed);
    expect(document.activeElement).toBe(q(h, "br-sheet-close"));
    q(h, "br-review")!.focus();
    await click(q(h, "br-review")!);
    expect(document.activeElement).toBe(q(h, "br-edit"));
    q(h, "br-place")!.focus();
    const before = intentLog().length;
    await click(q(h, "br-place")!);
    await click(q(h, "br-place")!);
    await key(q(h, "br-place")!, "Enter");
    expect(intentLog().length).toBe(before + 1);
    await click(q(h, "br-sheet-close")!);
    expect(q(h, "broker")!.dataset.phase).toBe("submitting");
    await tick(feed);
    await click(q(h, "br-trade")!);
    expect(q(h, "br-ack")?.getAttribute("data-status")).toBe("ACCEPTED");
    expect(document.activeElement).toBe(q(h, "br-new"));
    await click(q(h, "br-new")!);
    expect(document.activeElement).toBe(q(h, "br-qty"));
    expect(h.el.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(intentLog().length).toBe(before + 1);
  });

  it("Tab wraps at the modal's first and last controls", async () => {
    await mount(h, { context: "HALC", vw: 390 });
    await click(q(h, "br-trade")!);
    q(h, "br-review")!.focus();
    await key(q(h, "br-review")!, "Tab");
    expect(document.activeElement).toBe(q(h, "br-sheet-close"));
    await act(async () => { q(h, "br-sheet-close")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(q(h, "br-review"));
  });

  it("desktop stays inline and resizing out of phone removes only the modal UI", async () => {
    await mount(h, { context: "HALC", vw: 1440 });
    expect(q(h, "br-trade")).toBeNull();
    expect(q(h, "br-ticket")).not.toBeNull();
    await act(async () => { h.store.setState({ vw: 390 }); });
    await click(q(h, "br-trade")!);
    await typeQty(h, "9");
    await act(async () => { h.store.setState({ vw: 1440 }); });
    expect(q(h, "br-sheet")).toBeNull();
    expect(q(h, "br-qty")?.getAttribute("value")).toBe("9");
    await act(async () => { h.store.setState({ vw: 390 }); });
    expect(q(h, "br-sheet")).toBeNull();
    expect(q(h, "br-trade")?.getAttribute("aria-expanded")).toBe("false");
  });
});

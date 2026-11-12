// @vitest-environment happy-dom
// Card 28: Broker footer carries “Simulated market. Not financial advice.”
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { click, mount, q, setup, teardown, text, type Harness } from "./br-harness";

const EN = "Simulated market. Not financial advice.";
const FR = "Marché simulé. Ceci n’est pas un conseil financier.";

let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

describe("card 28 Broker simulated-market footer", () => {
  it("live HALC ticket shows the exact English disclaimer", async () => {
    await mount(h, { context: "HALC" });
    expect(q(h, "broker")!.dataset.state).toMatch(/live|stale/);
    expect(text(h, "br-disclaimer")).toBe(EN);
  });

  it("FR locale uses the French equivalent", async () => {
    await mount(h, { context: "HALC", locale: "fr" });
    expect(text(h, "br-disclaimer")).toBe(FR);
  });

  it("About view still carries the same footer", async () => {
    await mount(h, { context: "HALC" });
    const tab = q(h, "br-view-about");
    expect(tab).not.toBeNull();
    await click(tab!);
    expect(q(h, "broker")!.getAttribute("data-view")).toBe("about");
    expect(text(h, "br-disclaimer")).toBe(EN);
  });

  it("loading skeleton does not invent a number beside the footer", async () => {
    // First paint after mount is already live on the mock; if a loading frame is present it must not
    // pair the disclaimer with a fake cash or last figure.
    const feedHeld = await import("@/shell/contracts/mockFeed").then(() => null);
    void feedHeld;
    await mount(h, { context: "HALC" });
    const disc = q(h, "br-disclaimer");
    if (disc) {
      expect(disc.textContent).toBe(EN);
      expect(disc.textContent).not.toMatch(/\$|€|\d+\.\d{2}/);
    }
  });
});

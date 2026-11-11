// M2-05: what the player reads while offline. Ticket: Place off + last-received note; a failed Place says whether
// nothing was sent or the outcome is unknown (never "cancelled"). Strip: the market phase is replaced by
// "Offline · not live". Static offline screen: heading and status flip together.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewBlock } from "@/apps/broker/TicketReview";
import { brStrings } from "@/apps/broker/strings";
import { phaseLabel, phaseTone } from "@/components/shell/MarketPhase";

const t = brStrings("en");
const block = (p: Partial<Parameters<typeof ReviewBlock>[0]>) => renderToStaticMarkup(createElement(ReviewBlock, {
  t, locale: "en", action: "Buy 2 HALC", preview: null, stale: true, halted: false, canPlace: false, pendingTick: null,
  failed: false, offline: false, onEdit: () => {}, onPlace: () => {}, ...p,
}));

describe("ticket copy", () => {
  it("offline: the note says prices are the last received and Place is off; Place is disabled; no 'Refreshing'", () => {
    const html = block({ offline: true });
    expect(html).toContain(`data-testid="br-offline"`);
    expect(html).toContain("You&#x27;re offline. Prices shown are the last received. Place is off until you&#x27;re back online.");
    expect(html).not.toContain("br-refreshing");
    const place = html.match(/<button[^>]*data-testid="br-place"[^>]*>/)![0];
    expect(place).toContain(`aria-disabled="true"`); // Button keeps focus and ignores activation while disabled
  });
  it("a failed Place names why: not sent (offline), unknown (may have gone through), or the existing generic error", () => {
    expect(block({ failed: "offline" })).toContain("You&#x27;re offline. Nothing was sent.");
    const unknown = block({ failed: "unknown" });
    expect(unknown).toContain("This order may have gone through. Check Open orders and Positions before placing it again.");
    expect(unknown).not.toMatch(/cancel/i);
    expect(block({ failed: "error" })).toContain("Couldn&#x27;t load");
  });
});

describe("strip phase", () => {
  it("offline replaces 'Market open' with 'Offline · not live' and uses the dashed reconnecting tone", () => {
    expect(phaseLabel("continuous", false, "Port Avalon", false, true)).toBe("Offline · not live · Port Avalon");
    expect(phaseTone("continuous", true, false, true)).toBe("reconnecting");
    expect(phaseLabel("continuous", false, "Port Avalon")).toBe("Market open · Port Avalon"); // online unchanged
  });
});

describe("static offline screen", () => {
  it("heading, title, status and button flip together on reconnect", () => {
    const html = readFileSync(new URL("../../../public/offline.html", import.meta.url), "utf8");
    expect(html).toContain(`<h1 id="heading">You're offline</h1>`);
    expect(html).toContain(`head.textContent = on ? "You're back online" : "You're offline";`);
    expect(html).toContain(`document.title = on ? "Quay · Back online" : "Quay · Offline";`);
    expect(html).toContain(`text.textContent = on ? "Back online · reload to continue" : "Offline · no connection";`);
  });
});

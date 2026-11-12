// Portfolio shows the signed-in player's Launchpad coins as an honest separate block: the server's indicative value
// (≈, already inside the NW hero), cost basis and P&L, with copy saying it is an estimate after fee and impact, not a
// quote. With coins held, the "all cash" line is gone; without coins, nothing new shows.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverviewView } from "@/apps/portfolio/Overview";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { meBody } from "@/shell/contracts/schema";
import { MockFeed } from "@/shell/contracts/mockFeed";

const EMPTY = new MockFeed({ empty: true }).body("me") as MeTradingBody;
const html = (body: MeTradingBody, locale = "en") =>
  renderToStaticMarkup(createElement(OverviewView, { view: { state: "live", body, tick: 1 }, rank: { rank: "R1", thresholds: [], nextAt: null, shellsEarned: [] }, locale, phone: false, onRetry: () => {} }));
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("Portfolio Launchpad coins", () => {
  const coins = [{ ticker: "FROG", qty: 34_277_831, value: 49_005, cost: 50_000 }];
  it("value (≈), cost and P&L per coin; the honest estimate copy; no 'all cash' line", () => {
    const body = { ...EMPTY, nw: "9990.05", coins };
    expect(() => meBody(body)).not.toThrow(); // the me contract accepts it
    const out = html(body);
    expect(out).toContain('data-testid="pf-coins"');
    expect(out).toContain('data-ticker="FROG" data-value="49005" data-cost="50000"');
    const t = text(out);
    expect(t).toContain("Launchpad coins FROG · 34,277,831 ≈$490.05 cost $500.00 · P&L −$9.95");
    expect(t).toContain("estimate of what selling all of each now would pay, after the 1% fee and price impact. Not a quote");
    expect(out).not.toContain("pf-empty\"");
    expect(t).not.toContain("all cash");
    expect(text(html(body, "fr"))).toContain("Jetons Launchpad");
  });
  it("no coins: no coin block, the all-cash line stays", () => {
    const out = html({ ...EMPTY, coins: [] });
    expect(out).not.toContain("pf-coins");
    expect(out).toContain('data-testid="pf-empty"');
  });
});

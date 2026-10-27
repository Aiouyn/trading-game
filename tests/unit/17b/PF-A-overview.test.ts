// UI card 2 (17B PF-A): the pure Overview view per channel state (PF-2-02..08). Bodies come from the mock feed,
// with injected fields the mock never sends (nwStats, MDOL, restricted) marked as such.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverviewView, releaseText, type OverviewViewProps } from "@/apps/portfolio/Overview";
import { pfStrings } from "@/apps/portfolio/strings";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import type { ChannelView } from "@/shell/contracts/useChannel";
import type { RankChannel } from "@/shell/channels";

const ME = new MockFeed({}).body("me") as MeTradingBody;
const ME_EMPTY = new MockFeed({ empty: true }).body("me") as MeTradingBody;
const RANK: RankChannel = { rank: "R1", thresholds: [], nextAt: "250000.00", shellsEarned: [] };
const live = (body: MeTradingBody, state: "live" | "stale" = "live"): ChannelView<MeTradingBody> => ({ state, body, tick: 1 });
const html = (p: Partial<OverviewViewProps> = {}) =>
  renderToStaticMarkup(createElement(OverviewView, { view: live(ME), rank: RANK, locale: "en", phone: false, onRetry: () => {}, ...p }));
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const block = (s: string, testid: string) => {
  const i = s.indexOf(`data-testid="${testid}"`);
  if (i < 0) return null;
  const start = s.lastIndexOf("<", i);
  const tag = s.slice(start + 1, s.indexOf(" ", start));
  const end = s.indexOf(`</${tag}>`, i); // blocks never nest their own tag
  return s.slice(start, end + tag.length + 3);
};

describe("PF-2-02 hero = nominal NW", () => {
  it("shows me.nw through MoneyText hero, never nwi / realNw / nwStats", () => {
    const body = { ...ME, nw: "123456.78", nwi: "999.9", nwStats: { window: "90d", drawdownReal: "-4.2", sharpe: "1.31", twrIdx: "777.7", bench: "888.8" } };
    const hero = block(html({ view: live(body) }), "pf-hero")!;
    expect(hero).toContain("money-hero");
    expect(text(hero)).toBe("Net worth $123,456 .78");
    for (const other of ["999.9", "777.7", "888.8", "1.31"]) expect(hero).not.toContain(other);
  });
  it("hero is the serif hero size on desktop and phone (class hook for --fs-44 / --fs-30)", () => {
    expect(html()).toContain('class="pf-ov"');
    expect(html({ phone: true })).toContain('class="pf-ov pf-phone"');
  });
});

describe("PF-2-03 cents split", () => {
  it("integer and cents are separate spans; cents carry .cents (65 %, --fg-muted)", () => {
    const hero = block(html({ view: live({ ...ME, nw: "20000.05" }) }), "pf-hero")!;
    expect(hero).toMatch(/data-testid="money-int">\$20,000<\/span><span class="cents" data-testid="money-cents">\.05</);
  });
});

describe("PF-2-04 stats", () => {
  const stats = { window: "90d", drawdownReal: "-4.2", sharpe: "1.31", twrIdx: "1", bench: "1" };
  it("absent without nwStats (mock default)", () => {
    expect(ME.nwStats).toBeUndefined();
    expect(html()).not.toContain("pf-stats");
  });
  it("renders drawdownReal and sharpe verbatim", () => {
    const s = text(block(html({ view: live({ ...ME, nwStats: stats }) }), "pf-stats")!);
    expect(s).toBe("Drawdown (real) -4.2 Sharpe (whole NW) 1.31");
  });
  it("sharpe null renders an em dash", () => {
    const s = block(html({ view: live({ ...ME, nwStats: { ...stats, sharpe: null } }) }), "pf-sharpe")!;
    expect(text(s)).toBe("—");
  });
});

describe("PF-2-05 summary rows", () => {
  it("one Cash row per balances key; FDL via MoneyText, other codes as '{amount} {CODE}'", () => {
    const h = html({ view: live({ ...ME, balances: { FDL: "5000.00", MDOL: "1250.00" } }) });
    expect(text(block(h, "pf-balance-FDL")!)).toBe("Cash · FDL $5,000.00");
    expect(text(block(h, "pf-balance-MDOL")!)).toBe("Cash · MDOL 1,250.00 MDOL");
    expect(h).not.toMatch(/Holdings/);
  });
  it("negative non-FDL balance keeps its sign with a true minus", () => {
    expect(text(block(html({ view: live({ ...ME, balances: { MDOL: "-3.10" } }) }), "pf-amount-MDOL")!)).toBe("−3.10 MDOL");
  });
});

describe("PF-2-06 new player", () => {
  it("empty positions shows the EmptyState copy with no button", () => {
    expect(Object.keys(ME_EMPTY.positions)).toHaveLength(0);
    const h = html({ view: live(ME_EMPTY) });
    expect(text(block(h, "pf-empty")!)).toBe("Your money is all cash. Broker or Businesses are good first stops.");
    expect(block(h, "pf-summary")).not.toContain("<button");
  });
  it("with positions there is no EmptyState", () => {
    expect(html()).not.toContain("pf-empty");
  });
});

describe("PF-2-07 restricted", () => {
  const t = pfStrings("en");
  it("absent when empty (mock default)", () => {
    expect(ME.restricted).toEqual([]);
    expect(html()).not.toContain("pf-restricted");
  });
  it("one row per bucket with the AD/START pill and a written unit or 'held'", () => {
    const restricted = [
      { reason: "AD", amount: "120.00", untilRealMs: 3 * 3600_000 },
      { reason: "START", amount: "500.00", untilRealMs: null },
    ];
    const h = html({ view: live({ ...ME, restricted }) });
    const rows = h.split('data-testid="pf-restricted-row"').slice(1).map(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("$120.00 AD releases in 3 hours");
    expect(rows[1]).toContain("$500.00 START held");
  });
  it("release wording picks minutes / hours / days, singular at 1", () => {
    expect(releaseText(60_000, t, "en")).toBe("releases in 1 minute");
    expect(releaseText(30 * 60_000, t, "en")).toBe("releases in 30 minutes");
    expect(releaseText(3600_000, t, "en")).toBe("releases in 1 hour");
    expect(releaseText(47 * 3600_000, t, "en")).toBe("releases in 47 hours");
    expect(releaseText(3 * 86_400_000, t, "en")).toBe("releases in 3 days");
    expect(releaseText(0, t, "en")).toBe("releases in 1 minute");
    expect(releaseText(null, t, "en")).toBe("held");
    expect(releaseText(3 * 3600_000, pfStrings("fr"), "fr")).toBe("déblocage dans 3\u00A0heures");
  });
});

describe("PF-2-08 states", () => {
  it("loading: one hero skeleton bar, no values", () => {
    const h = html({ view: { state: "loading", body: null, tick: null } });
    expect(h.match(/data-testid="pf-loading"/g)).toHaveLength(1);
    expect(h).not.toContain("money");
  });
  it("stale: values stay, 'Updating…' under the hero", () => {
    const h = html({ view: live(ME, "stale") });
    expect(text(block(h, "pf-updating")!)).toBe("Updating…");
    expect(h).toContain("money-hero");
  });
  it.each(["denied", "error"] as const)("%s: Couldn't load + Retry", (state) => {
    const h = html({ view: { state, body: null, tick: null } });
    expect(text(block(h, "pf-error")!)).toBe("Couldn't load Retry");
    expect(h).not.toContain("money");
  });
});

describe("rank", () => {
  it("chip 'R1 · Hustler' (acc) and Next rank at MoneyText(nextAt)", () => {
    const r = block(html(), "pf-rank")!;
    expect(r).toMatch(/class="chip chip-acc"[^>]*>R1 · Hustler</);
    expect(text(r)).toBe("R1 · Hustler Next rank at $250k");
    expect(r).not.toMatch(/progress/);
  });
  it("top rank when nextAt is null", () => {
    expect(text(block(html({ rank: { ...RANK, rank: "R6", nextAt: null } }), "pf-next")!)).toBe("Top rank");
  });
  it("phone order: hero, rank, summary, restricted, stats", () => {
    const h = html({ phone: true, view: live({ ...ME, restricted: [{ reason: "AD", amount: "1.00", untilRealMs: null }], nwStats: { window: "", drawdownReal: "0", sharpe: null, twrIdx: "", bench: "" } }) });
    const order = ["pf-hero", "pf-rank", "pf-summary", "pf-restricted", "pf-stats"].map((id) => h.indexOf(`data-testid="${id}"`));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]!))).toBe(true);
  });
});

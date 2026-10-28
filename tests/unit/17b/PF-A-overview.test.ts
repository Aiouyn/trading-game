// UI card 2 (17B PF-A): the pure Overview view per channel state (PF-2-02..08). Bodies come from the mock feed (which
// sends nwStats, MDOL and restricted buckets; `empty: true` is the new player without them), with overrides per case.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverviewView, drawdownText, releaseText, type OverviewViewProps } from "@/apps/portfolio/Overview";
import { formatPercent } from "@/components/ui/percent";
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
  it("the mock sends nwStats; absent for the new player (empty)", () => {
    expect(ME.nwStats).toEqual({ window: "90d", drawdownReal: "-4.2", sharpe: "1.31", twrIdx: "1.0842", bench: "1.0315" });
    expect(html()).toContain("pf-stats");
    expect(ME_EMPTY.nwStats).toBeUndefined();
    expect(html({ view: live(ME_EMPTY) })).not.toContain("pf-stats");
  });
  it("drawdownReal (bare decimal, percent units) renders '−4.2%' with U+2212; sharpe verbatim", () => {
    const s = text(block(html({ view: live({ ...ME, nwStats: stats }) }), "pf-stats")!);
    expect(s).toBe("Drawdown (real) \u22124.2% Sharpe (whole NW) 1.31");
  });
  it("FR: decimal comma and a narrow no-break space (U+202F) before %", () => {
    expect(drawdownText("-4.2", "fr")).toBe("\u22124,2\u202F%");
    const s = block(html({ locale: "fr", view: live({ ...ME, nwStats: stats }) }), "pf-drawdown")!;
    expect(s).toContain(">\u22124,2\u202F%</td>"); // raw markup: text() would fold U+202F into a space
  });
  it.each([
    ["-4.2", "en-US", "\u22124.2%"], ["4.2", "en-US", "4.2%"], ["0", "en-US", "0%"], ["-0.0", "en-US", "0.0%"],
    ["-12.75", "en-US", "\u221212.75%"], ["-1234.5", "en-US", "\u22121,234.5%"], ["-1234.5", "fr-FR", "\u22121\u202F234,5\u202F%"],
    ["+3", "en-US", "3%"],
  ])("formatPercent(%s, %s) = %s (digits as sent, punctuation from the locale)", (v, loc, want) => {
    expect(formatPercent(v, loc)).toBe(want);
  });
  it("a value that is not a plain decimal shows as sent (never guessed)", () => {
    expect(formatPercent("-4.2%", "en-US")).toBeNull();
    expect(drawdownText("n/a", "en")).toBe("n/a");
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
  it("the mock sends AD_GRANT (releases in 3 hours) and FRESH_START (held), the engine codes; none for the new player", () => {
    expect(ME.restricted).toEqual([{ reason: "AD_GRANT", amount: "500.00", untilRealMs: 3 * 3600_000 }, { reason: "FRESH_START", amount: "2500.00", untilRealMs: null }]);
    expect(ME_EMPTY.restricted).toEqual([]);
    expect(html({ view: live(ME_EMPTY) })).not.toContain("pf-restricted");
  });
  it("Studio fix a: AD / START pills are a --steel outline with --fg-muted text, never brass", () => {
    const r = block(html(), "pf-restricted")!;
    expect(r.match(/class="chip chip-steel chip-outline"/g)).toHaveLength(2);
    expect(r).not.toContain("chip-acc");
  });
  it("Studio Q2: an unlabelled reason shows its raw code in the neutral chip, named 'Restricted (CODE)' (EN + FR)", () => {
    const restricted = [{ reason: "LOCKUP", amount: "75.00", untilRealMs: null }];
    const en = block(html({ view: live({ ...ME, restricted }) }), "pf-restricted-code")!;
    expect(en).toMatch(/^<span title="Restricted \(LOCKUP\)" aria-label="Restricted \(LOCKUP\)" data-testid="pf-restricted-code" class="chip chip-steel chip-outline">LOCKUP<\/span>$/);
    const fr = block(html({ locale: "fr", view: live({ ...ME, restricted }) }), "pf-restricted-code")!;
    expect(fr).toContain('title="Bloqué (LOCKUP)" aria-label="Bloqué (LOCKUP)"');
  });
  it("Studio fix c: stacked view at text scale ≥ 1.5 (class hook; CSS stacks label over value, nowrap)", () => {
    expect(html({ stacked: true })).toContain('class="pf-ov pf-stacked"');
    expect(html({ phone: true, stacked: true })).toContain('class="pf-ov pf-phone pf-stacked"');
  });
  it("one row per bucket with the AD_GRANT/FRESH_START pill (labels AD / START) and a written unit or 'held'", () => {
    const restricted = [
      { reason: "AD_GRANT", amount: "120.00", untilRealMs: 3 * 3600_000 },
      { reason: "FRESH_START", amount: "500.00", untilRealMs: null },
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
    const h = html({ phone: true, view: live({ ...ME, restricted: [{ reason: "AD_GRANT", amount: "1.00", untilRealMs: null }], nwStats: { window: "", drawdownReal: "0", sharpe: null, twrIdx: "", bench: "" } }) });
    const order = ["pf-hero", "pf-rank", "pf-summary", "pf-restricted", "pf-stats"].map((id) => h.indexOf(`data-testid="${id}"`));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]!))).toBe(true);
  });
});

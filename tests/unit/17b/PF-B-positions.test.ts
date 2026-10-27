// UI card 3 (17B PF-B): the pure Positions view per channel state (PF-3-01..07, 09, 10) on mock feed bodies, plus the
// Studio PF-B ruling pieces (liqPrice, marginState) that Position does not carry on this base (rendered when present).
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiqPrice, MarginChip, Pnl, Today, rowLabel, type PositionData } from "@/apps/portfolio/PositionRow";
import { PositionsView, sortedPositions, type PositionsViewProps } from "@/apps/portfolio/Positions";
import { decText, direction } from "@/apps/portfolio/positions/format";
import { posStrings, type MarginState } from "@/apps/portfolio/positions/strings";
import type { MeTradingBody, TickerBody } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import type { ChannelView } from "@/shell/contracts/useChannel";

const ME = new MockFeed({}).body("me") as MeTradingBody;
const ME_EMPTY = new MockFeed({ empty: true }).body("me") as MeTradingBody;
const TICK = (new MockFeed({}).body("ticker:wl_default") as TickerBody).rows;
const TICK_HALT = (new MockFeed({ halt: "HALC" }).body("ticker:wl_default") as TickerBody).rows;
const EN = posStrings("en"), FR = posStrings("fr");
const live = (body: MeTradingBody, state: "live" | "stale" = "live"): ChannelView<MeTradingBody> => ({ state, body, tick: 1 });
const html = (p: Partial<PositionsViewProps> = {}) =>
  renderToStaticMarkup(createElement(PositionsView, { view: live(ME), tickers: TICK, locale: "en", cards: false, phone: false, onRetry: () => {}, ...p }));
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const rows = (s: string) => s.split(/(?=<tr class="pos-tr"|<li class="pos-card")/).slice(1);
const cell = (row: string, id: string) => { const m = new RegExp(`data-testid="${id}"[^>]*>([\\s\\S]*?)</(td|span)>`).exec(row); return m ? text(m[1]) : null; };
const attr = (row: string, a: string) => new RegExp(`${a}="([^"]*)"`).exec(row)?.[1] ?? null;
const r = <P extends object>(el: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(el, props));

describe("PF-3-01 rows A→Z, contract strings verbatim", () => {
  it("3 rows AVB, HALC, VOLT (mock sends HALC, VOLT, AVB)", () => {
    expect(Object.keys(ME.positions)).toEqual(["HALC", "VOLT", "AVB"]);
    expect(sortedPositions(ME).map((p) => p.assetId)).toEqual(["AVB", "HALC", "VOLT"]);
    expect(rows(html()).map((x) => attr(x, "data-asset"))).toEqual(["AVB", "HALC", "VOLT"]);
  });
  it("Qty, Avg cost, Last (ticker last), Value and P&L show the contract digits", () => {
    const halc = rows(html())[1];
    expect([cell(halc, "pos-qty"), cell(halc, "pos-avg"), cell(halc, "pos-last")]).toEqual(["1,200", "39.90", TICK.HALC.last]);
    expect(text(/data-testid="pos-value"[\s\S]*?<\/td>/.exec(halc)![0].replace(/^[^>]*>/, ""))).toBe("$50,616.00");
    expect(halc).toContain("money-table");
    expect(halc).toContain("money-delta");
  });
  it("Last falls back to mark when the ticker has no row", () => {
    const halc = rows(html({ tickers: null }))[1];
    expect(cell(halc, "pos-last")).toBe(ME.positions.HALC.mark);
  });
  it("seven column headers in spec order", () => {
    const heads = [...html().matchAll(/<th scope="col"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(heads).toEqual(["Asset", "Qty", "Avg cost", "Last", "Today", "Value", "P&amp;L"]);
  });
});

describe("PF-3-02 Today: chgPct verbatim + %, colour and arrow from the leading sign", () => {
  const today = (pct: string | null, locale = "en") => r(Today, { pct, t: posStrings(locale), locale });
  it("negative: ▼, loss, U+2212", () => {
    const h = today("-0.35");
    expect(text(h)).toBe("▼ −0.35%");
    expect(h).toContain("loss");
  });
  it("positive: ▲, gain, digits as sent", () => {
    const h = today("1.25");
    expect(text(h)).toBe("▲ 1.25%");
    expect(h).toContain("gain");
  });
  it("zero: no arrow, --fg-muted", () => {
    for (const z of ["0", "0.00", "-0.00"]) { const h = today(z); expect(h).toContain("muted"); expect(h).not.toMatch(/[▲▼]/); }
  });
  it("null: em dash", () => expect(text(today(null))).toBe("—"));
  it("FR: decimal comma, narrow no-break space before %", () => expect(today("-0.35", "fr").replace(/<[^>]+>/g, "")).toBe("▼−0,35\u202F%"));
  it("decText keeps every sent decimal (no float step)", () => {
    expect(decText("12345678901234567.123456789", "en")).toBe("12,345,678,901,234,567.123456789");
    expect(decText("-0.10", "en")).toBe("−0.10");
    expect(decText("1234.5", "fr")).toBe("1\u202F234,5");
    expect(decText("n/a", "en")).toBe("n/a");
  });
  it("direction is a string test", () => {
    expect(["-1", "1", "+1", "0.00", "-0.0"].map(direction)).toEqual(["down", "up", "up", "flat", "flat"]);
  });
  it("P&L: arrow beside MoneyText delta (sign + colour from MoneyText)", () => {
    const up = r(Pnl, { upl: "2736.00" }), down = r(Pnl, { upl: "-318.00" });
    expect(text(up)).toBe("▲ +$2,736.00");
    expect(text(down)).toBe("▼ −$318.00");
    expect(down).toContain("loss");
  });
});

describe("PF-3-03 halted chip", () => {
  it("halted ticker shows a steel 'Halted' outline chip on that row only", () => {
    const [avb, halc] = rows(html({ tickers: TICK_HALT }));
    expect(halc).toContain('data-testid="pos-halted"');
    expect(cell(halc, "pos-halted")).toBe("Halted");
    expect(/<span[^>]*data-testid="pos-halted"[^>]*>/.exec(halc)![0]).toContain('class="chip chip-outline pos-chip pos-halted"');
    expect(avb).not.toContain("pos-halted");
    expect(html()).not.toContain("pos-halted");
  });
});

describe("PF-3-04 pledged / lent badges", () => {
  it("'Pledged 40' and 'Lent 5' when not \"0\"; none when \"0\"", () => {
    const me = { ...ME, positions: { ...ME.positions, HALC: { ...ME.positions.HALC, pledgedQty: "40", lentQty: "5" } } };
    const halc = rows(html({ view: live(me) }))[1];
    expect(cell(halc, "pos-pledged")).toBe("Pledged 40");
    expect(cell(halc, "pos-lent")).toBe("Lent 5");
    expect(html()).not.toContain("pos-pledged");
    expect(html()).not.toContain("pos-lent");
  });
  it("a \"0.00\" pledged qty is not \"0\" by string compare, so it shows (contract sends \"0\")", () => {
    const me = { ...ME, positions: { HALC: { ...ME.positions.HALC, pledgedQty: "0.00" } } };
    expect(html({ view: live(me) })).toContain("pos-pledged");
  });
});

describe("PF-3-05 empty", () => {
  it("no rows: 'No positions yet.' + 'Your money is all cash.', no table, no button", () => {
    const h = html({ view: live(ME_EMPTY) });
    expect(text(h)).toBe("No positions yet. Your money is all cash.");
    expect(h).not.toContain("<table");
    expect(h).not.toContain("<button");
  });
});

describe("PF-3-06 states", () => {
  it("loading: 3 skeleton rows, aria-busy", () => {
    const h = html({ view: { state: "loading", body: null, tick: null } });
    expect(h.match(/data-testid="pos-skel"/g)).toHaveLength(3);
    expect(h).toContain('aria-busy="true"');
  });
  it("stale: 'Updating…' and Last carries .pos-stale (--fg-disabled)", () => {
    const h = html({ view: live(ME, "stale") });
    expect(text(h)).toContain("Updating…");
    for (const row of rows(h)) expect(row).toMatch(/class="num pos-last pos-stale pos-col-last" data-testid="pos-last"/);
    expect(html()).not.toContain("pos-stale");
  });
  it("denied and error: Couldn't load + Retry", () => {
    for (const state of ["denied", "error"] as const) {
      const h = html({ view: { state, body: null, tick: null } });
      expect(text(h)).toBe("Couldn't load Retry");
      expect(h).toContain('data-testid="pos-retry"');
    }
  });
});

describe("PF-3-07 row label", () => {
  it("HALC: ticker, qty shares, spoken value, up/down chgPct percent today", () => {
    const halc = rows(html())[1];
    expect(attr(halc, "aria-label")).toMatch(/^HALC, 1,200 shares, value 50,616\.00 dollars, down 0\.35 percent today, average cost 39\.90, last 42\.18$/);
    expect(attr(halc, "tabindex")).toBe("0");
  });
  it("up and unchanged wording; FR", () => {
    const p = ME.positions.HALC as PositionData;
    expect(rowLabel(p, { ...TICK.HALC, chgPct: "1.20" }, EN, "en")).toContain(", up 1.20 percent today");
    expect(rowLabel(p, { ...TICK.HALC, chgPct: "0.00" }, EN, "en")).toContain(", unchanged today");
    expect(rowLabel(p, { ...TICK.HALC, chgPct: null }, EN, "en")).not.toContain("today");
    expect(rowLabel(p, TICK.HALC, FR, "fr")).toMatch(/^HALC, 1\u202F200 actions, valeur .*, en baisse de 0\.35 pour cent aujourd’hui, coût moyen 39,90, dernier 42,18$/);
  });
});

describe("PF-3-09 cards (phone, text scale ≥ 1.5)", () => {
  it("2-line card: ticker (+ value under it) and P&L; then '{qty} @ {avgCost}' and Today", () => {
    const h = html({ cards: true, phone: true });
    expect(h).not.toContain("<table");
    const halc = rows(h)[1];
    expect(halc.startsWith('<li class="pos-card"')).toBe(true);
    const lines = halc.split('class="pos-line').slice(1).map((l) => text(l.replace(/^[^>]*>/, "").replace(/<div\s*$/, "")));
    expect(lines[0]).toBe("HALC $50,616.00 ▲ +$2,736.00");
    expect(lines[1].startsWith("1,200 @ 39.90 ▼ −0.35%")).toBe(true);
    expect(h).toContain('class="pos pos-cards pos-phone"');
  });
});

describe("PF-3-10 arrows present so colour is never the only cue", () => {
  it("every non-flat Today and P&L carries an aria-hidden arrow", () => {
    for (const row of rows(html())) expect(row.match(/class="pos-arrow" aria-hidden="true">[▲▼]</g)!.length).toBe(2);
  });
});

describe("Studio PF-B ruling: E-56 fields when present", () => {
  it("liqPrice: '≈ {value}' + small-caps 'approx.' and aria 'approximately {value}'", () => {
    const h = r(LiqPrice, { value: "-31.5", t: EN, locale: "en" });
    expect(text(h)).toBe("Liq. ≈ −31.5 approx.");
    expect(h).toContain('aria-label="Liq. approximately −31.5"');
    expect(h).toContain('class="pos-approx"');
  });
  it("marginState chip only when not OK; tone per state; alert glyph on LIQUIDATING / DEFICIT", () => {
    const chip = (state: MarginState | null) => r(MarginChip, { state, t: EN });
    expect(chip("OK")).toBe("");
    expect(chip(null)).toBe("");
    expect(chip("CALL")).toContain("pos-margin-call");
    expect(chip("CALL")).not.toContain("<svg");
    for (const s of ["LIQUIDATING", "DEFICIT"] as const) { expect(chip(s)).toContain("pos-margin-alert"); expect(chip(s)).toContain("<svg"); }
    expect(chip("CLOSED")).toContain("pos-margin-closed");
  });
  it("row shows liq + margin only when sent; pnlPct / weightPct have no placement and never render", () => {
    const halc = { ...ME.positions.HALC, liqPrice: "31.50", marginState: "CALL", pnlPct: "6.86", weightPct: "57.6" } as PositionData;
    const h = html({ view: live({ ...ME, positions: { HALC: halc } }) });
    expect(h).toContain("pos-liq");
    expect(h).toContain("pos-margin-call");
    expect(h).not.toContain("6.86");
    expect(h).not.toContain("57.6");
    expect(html()).not.toContain("pos-liq");
    expect(html()).not.toContain("pos-margin");
  });
  it("no --acc class on any row", () => {
    for (const h of [html(), html({ cards: true }), html({ tickers: TICK_HALT })]) expect(h).not.toMatch(/chip-acc|money-wealth|\bacc\b/);
  });
});

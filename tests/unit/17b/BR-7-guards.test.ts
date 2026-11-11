// UI card 7 (17B BRK-B): source guards. BR-7-04 a price becomes a number only in toPoints() (G1), no arithmetic on a
// Candle field anywhere in the chart; BR-7-05 the chart's colours are tokens (no hex), the token map is the spec's, and
// the chart's plot is its own lazy chunk (BR-7-01, source side).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHART_TOKENS } from "@/components/market/chartTheme";
import { BR_STRINGS } from "@/apps/broker/strings";

const BR7_CHART_FILES = ["src/components/market/CandleChart.tsx", "src/components/market/ChartTable.tsx", "src/components/market/chartTheme.ts"];
const ALL = [...BR7_CHART_FILES, "src/components/market/PriceChart.tsx", "src/components/market/candleChart.css", "src/shell/contracts/history.ts", "src/apps/broker/BrokerFrame.tsx", "src/apps/broker/AssetHeader.tsx"];
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = (f: string) => strip(readFileSync(f, "utf8"));
const NUM = /\bNumber\(|parseFloat|parseInt|BigInt\(|\bMath\.(?:abs|sign)\b|(?:^|[^\w.])[+](?:[\w$]+\.)+[ohlcv]\b/;
const FIELD_MATH = [/\.[ohlcv]\b\s*[-+*/%<>]=?\s*[\w($.]/, /[\w)\]]\s*[-+*/%<>]=?\s*(?:[\w$]+\.)+[ohlcv]\b(?!\s*[:=(])/];

/** The body of `export function toPoints`, to its closing brace at column 0. */
function toPointsBody(s: string): string {
  const i = s.indexOf("export function toPoints(");
  return s.slice(i, s.indexOf("\n}\n", i) + 2);
}

describe("BR-7-04 G1: numbers only in toPoints()", () => {
  it("Number( / parseFloat appear in CandleChart.tsx only inside toPoints()", () => {
    const s = src(BR7_CHART_FILES[0]!);
    const body = toPointsBody(s);
    expect(body).toMatch(/Number\(b\.c\)/);
    const rest = s.replace(body, "");
    expect(rest.split("\n").filter((l) => NUM.test(l))).toEqual([]);
  });
  for (const f of ALL.filter((x) => x !== BR7_CHART_FILES[0])) {
    it(`${f}: no number parsing`, () => {
      expect(src(f).split("\n").filter((l) => NUM.test(l.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')))).toEqual([]);
    });
  }
  for (const f of ALL) {
    it(`${f}: no arithmetic or comparison on a Candle field`, () => {
      const hits = src(f).split("\n").filter((l) => FIELD_MATH.some((r) => r.test(l.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""'))));
      expect(hits).toEqual([]);
    });
  }
  it("the guard bites: a Number( outside toPoints and a field sum are found", () => {
    expect(NUM.test("const x = Number(bar.c);")).toBe(true);
    expect(FIELD_MATH.some((r) => r.test("const d = b.c - a.c;"))).toBe(true);
    expect(FIELD_MATH.some((r) => r.test("if (b.h > b.l) x();"))).toBe(true);
  });
});

describe("BR-7-05 colours are tokens", () => {
  it("no hex (or rgb/hsl literal) in the 3 chart files and the chart CSS", () => {
    for (const f of [...BR7_CHART_FILES, "src/components/market/candleChart.css"]) {
      expect(src(f).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g), f).toBeNull();
    }
  });
  it("the token map is the spec's (series --fg, bg --win, text --fg-faint, grid --grid, crosshair --line)", () => {
    expect(CHART_TOKENS).toMatchObject({ series: "--fg", bg: "--win", text: "--fg-faint", grid: "--grid", crosshair: "--line" });
  });
  it("no brass in the chart: --acc is not a chart token and the chart CSS never names it", () => {
    expect(Object.values(CHART_TOKENS)).not.toContain("--acc");
    expect(src("src/components/market/candleChart.css")).not.toMatch(/--acc\b/);
    const block = readFileSync("src/apps/broker/broker.css", "utf8").split("/* Price chart (UI card 7)")[1]?.split("/* Phone: one column")[0] ?? "";
    expect(block).toMatch(/\.br-chart-box/);
    expect(block).not.toMatch(/--acc\b/);
  });
});

describe("BR-7-01 the plot is a lazy chunk (source side; the network check is e2e)", () => {
  it("lightweight-charts is imported by CandleChart.tsx only, and PriceChart reaches it through import()", () => {
    const pc = src("src/components/market/PriceChart.tsx");
    expect(pc).toMatch(/import\("\.\/CandleChart"\)/);
    expect(pc).not.toMatch(/^import (?!type )[^;]*from "\.\/CandleChart"/m);
    for (const f of ALL.filter((x) => x !== BR7_CHART_FILES[0])) expect(src(f), f).not.toMatch(/lightweight-charts/);
    expect(pc).toMatch(/^import type \{ CandleChartProps \} from "\.\/CandleChart";$/m);
  });
});

describe("copy", () => {
  it("EN / FR keys from the card's table, FR with NNBSP", () => {
    const en = BR_STRINGS.en, fr = BR_STRINGS.fr;
    expect([en.chartTitle, fr.chartTitle]).toEqual(["Price", "Cours"]);
    expect(Object.values(en.range)).toEqual(["1H", "1D", "1W", "1Q", "1Y", "All"]);
    expect(Object.values(fr.range)).toEqual(["1\u202fh", "1\u202fj", "1\u202fsem.", "1\u202ftrim.", "1\u202fan", "Tout"]);
    expect(en.chartAria("HALC", "1D", "41.00", "42.18")).toBe("HALC price, 1D: from 41.00 to 42.18");
    expect(fr.chartAria("HALC", "1\u202fj", "41,00", "42,18")).toBe("Cours de HALC, 1\u202fj\u202f: de 41,00 à 42,18");
    // M1-07: the crosshair announces the whole candle.
    expect(en.crosshairAria("Day 39 · 11:20", "42.00", "42.30", "41.90", "42.18", "120")).toBe("Day 39 · 11:20: open 42.00, high 42.30, low 41.90, close 42.18, volume 120");
    expect(fr.crosshairAria("t", "1", "2", "0,5", "1", "0")).toBe("t\u202f: ouverture 1, haut 2, bas 0,5, clôture 1, volume 0");
    expect([en.legend, fr.legend]).toEqual([{ o: "O", h: "H", l: "L", c: "C", v: "Vol" }, { o: "O", h: "H", l: "B", c: "C", v: "Vol." }]);
    expect([en.tickLabel("5"), fr.tickLabel("5")]).toEqual(["t 5", "t 5"]);
    expect([en.viewTable, en.viewChart, fr.viewTable, fr.viewChart]).toEqual(["View as table", "View as chart", "Voir le tableau", "Voir le graphique"]);
    expect(Object.values(en.col)).toEqual(["Time", "Open", "High", "Low", "Close", "Volume"]);
    expect(Object.values(fr.col)).toEqual(["Heure", "Ouverture", "Plus haut", "Plus bas", "Clôture", "Volume"]);
    expect([en.chartError, fr.chartError]).toEqual(["Couldn't load chart", "Impossible de charger le graphique"]);
    expect([en.noHistory, fr.noHistory]).toEqual(["No price history yet.", "Pas encore d\u2019historique de cours."]);
    expect([en.rangeAria, fr.rangeAria, en.halted, fr.halted]).toEqual(["Chart range", "Période du graphique", "Halted", "Suspendu"]);
  });
});

describe("M1-07 volume colours", () => {
  it("parseSrgb reads the computed color-mix() form for the library; anything else is not its job", async () => {
    const { parseSrgb } = await import("@/components/market/chartColor");
    expect(parseSrgb("color(srgb 0.247059 0.819608 0.690196 / 0.22)")).toEqual([63, 209, 176, 0.22]);
    expect(parseSrgb("color(srgb 1 0 0.5)")).toEqual([255, 0, 128, 1]);
    expect(parseSrgb("color(display-p3 1 0 0)")).toBeNull();
    expect(parseSrgb("red")).toBeNull();
  });
  it("chartColor.ts is colour channels only: it imports nothing and never sees a bar", () => {
    const s = src("src/components/market/chartColor.ts");
    expect(s).not.toMatch(/\bimport\b|\bBar\b|\bCandle\b/);
  });
});

// UI card 2 (17B PF-A): source guards. PF-2-01 no Money arithmetic or parsing in the Portfolio app; CSS hooks for
// PF-2-02/03 and the #38 segment; strings EN/FR parity and FR typography.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PF_STRINGS } from "@/apps/portfolio/strings";

const DIR = "src/apps/portfolio";
const code = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ f, src: readFileSync(join(DIR, f), "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "") }));
const css = readFileSync(join(DIR, "portfolio.css"), "utf8");

/** Me Money fields (MeTradingBody / RestrictedBucket / RankChannel.nextAt). */
const MONEY = String.raw`(?:nw|nwi|amount|nextAt|balances(?:\[[^\]]*\])?|value|upl|liabilities)`;
const ARITH = [
  new RegExp(String.raw`\b${MONEY}\s*[-+*/%]\s*[\w($.]`), // field ± x
  new RegExp(String.raw`[\w)\]]\s*[-+*/%]\s*(?:\w+\.)*${MONEY}\b(?!\s*[:=(])`), // x ± field
  new RegExp(String.raw`(?:^|[=(,\s])[+-]\s*(?:\w+\.)+${MONEY}\b`), // unary +me.nw
];

export function moneyMathHits(src: string): string[] {
  const hits: string[] = [];
  for (const raw of src.split("\n")) {
    // Ignore string literals and JSX tag punctuation ("pf-hero-nw", "/>", "</div>"); keep the code.
    const line = raw.replace(/"[^"]*"|'[^']*'/g, '""').replace(/<\/\w*>?|\/>/g, " ");
    if (/\bNumber\(|parseFloat|parseInt|BigInt\(|Math\.\w+\([^)]*\b(?:nw|amount|nextAt)\b/.test(line)) hits.push(raw.trim());
    else if (/\b(?:me|b|body|rank)\.(?:nw|nwi|amount|nextAt|balances)\b/.test(line) && ARITH.some((r) => r.test(line))) hits.push(raw.trim());
  }
  return hits;
}

describe("PF-2-01 numbers only through MoneyText", () => {
  it.each(code)("$f has no Number()/parseFloat/parseInt or arithmetic on me Money fields", ({ src }) => {
    expect(moneyMathHits(src)).toEqual([]);
  });
  it("the scanner catches the patterns it bans", () => {
    for (const bad of ["const x = Number(me.nw);", "const x = parseFloat(b.amount);", "const s = me.nw + me.nwi;", "total = total + b.amount;", "const n = +me.nw;", "const k = parseInt(rank.nextAt, 10);"]) {
      expect(moneyMathHits(bad), bad).not.toEqual([]);
    }
    expect(moneyMathHits("const ms = Math.max(untilRealMs, 0);")).toEqual([]);
  });
  it("hero never reads nwi / realNw / nwStats into MoneyText", () => {
    const ov = code.find((c) => c.f === "Overview.tsx")!.src;
    expect(ov).toMatch(/<MoneyText amount=\{me\.nw\} ctx="hero" \/>/);
    expect(ov).not.toMatch(/realNw|me\.nwi|nwBreakdown/);
  });
});

describe("CSS hooks", () => {
  it("PF-2-02 hero: serif, --fs-44 desktop, --fs-30 phone, --acc-wealth integer", () => {
    expect(css).toMatch(/\.pf-hero-nw \{ font: 400 var\(--fs-44\) \/ 1\.1 var\(--font-display\);/);
    expect(css).toMatch(/\.pf-phone \.pf-hero-nw \{ font-size: var\(--fs-30\); \}/);
    expect(css).toMatch(/\.pf-hero-nw \.money:not\(\.loss\):not\(\.muted\) \{ color: var\(--acc-wealth\); \}/);
  });
  it("PF-2-03 cents stay at the primitive rule (65 %, --fg-muted)", () => {
    const prim = readFileSync("src/styles/primitives.css", "utf8");
    expect(prim).toContain(".cents { font-size: 65%; color: var(--fg-muted); }");
    expect(css).not.toMatch(/\.cents/);
  });
  it("#38 segment: 28 px, --line border, radius 6, selected --win2 --fg 500, no brass anywhere", () => {
    expect(css).toMatch(/\.pf-seg \{[^}]*border: 1px solid var\(--line\); border-radius: 6px;/);
    expect(css).toMatch(/\.pf-seg button \{ min-height: 28px;/);
    expect(css).toMatch(/\.pf-seg button\[aria-selected="true"\] \{ color: var\(--fg\); background: var\(--win2\); font-weight: 500; \}/);
    expect(css).toMatch(/@media \(pointer: coarse\) \{ \.pf-seg button, \.pf-nav-item \{ min-height: 44px; \} \}/);
    expect(css).not.toMatch(/var\(--acc\)|--brass/);
  });
  it("two columns from 900 px; no animation", () => {
    expect(css).toContain("@container (min-width: 900px)");
    expect(css).not.toMatch(/animation|transition/);
  });
});

describe("strings", () => {
  const keys = (o: object) => Object.keys(o).sort();
  it("EN and FR have the same keys", () => { expect(keys(PF_STRINGS.fr)).toEqual(keys(PF_STRINGS.en)); });
  it("FR typography: single-char ellipsis, curly apostrophe, no-break space before units", () => {
    const fr = Object.values(PF_STRINGS.fr).filter((v): v is string => typeof v === "string");
    for (const s of fr) { expect(s).not.toContain("..."); expect(s).not.toContain("'"); }
    expect(PF_STRINGS.fr.updating).toBe("Mise à jour…");
    expect(PF_STRINGS.fr.releasesIn("3", "hour", false)).toBe("déblocage dans 3\u00A0heures");
    expect(PF_STRINGS.fr.releasesIn("1", "day", true)).toBe("déblocage dans 1\u00A0jour");
  });
  it("EN copy matches the card", () => {
    const en = PF_STRINGS.en;
    expect([en.overview, en.positions, en.backToPortfolio, en.netWorth, en.drawdownReal, en.sharpe, en.nextRankAt, en.topRank, en.updating, en.couldntLoad, en.retry, en.held])
      .toEqual(["Overview", "Positions", "Back to Portfolio", "Net worth", "Drawdown (real)", "Sharpe (whole NW)", "Next rank at", "Top rank", "Updating…", "Couldn't load", "Retry", "held"]);
    expect(en.cash("FDL")).toBe("Cash · FDL");
    expect(en.emptyCash).toBe("Your money is all cash. Broker or Businesses are good first stops.");
  });
});

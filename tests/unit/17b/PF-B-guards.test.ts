// UI card 3 (17B PF-B): source guards. PF-3-02 no number parsing of server strings in the positions files; PF-3-03 /
// ruling: no brass on rows; neutral chips --steel; PF-3-06 stale Last --fg-disabled; PF-3-08 narrow hides; PF-3-10
// colour from the gain/loss tokens (the cb pair overrides them); EN/FR parity.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POS_STRINGS } from "@/apps/portfolio/positions/strings";

const FILES = ["src/apps/portfolio/Positions.tsx", "src/apps/portfolio/PositionRow.tsx", "src/apps/portfolio/positions/format.ts", "src/apps/portfolio/positions/strings.ts"];
const strip = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
const code = FILES.map((f) => ({ f, src: strip(readFileSync(f, "utf8")) }));
const css = strip(readFileSync("src/apps/portfolio/positions.css", "utf8"));
const rule = (sel: string) => { const i = css.indexOf(`\n${sel} {`); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };

describe("PF-3-02 no parsing of server strings", () => {
  it("no Number( / parseFloat / parseInt / BigInt( / unary + on fields / Math. in positions code", () => {
    for (const { f, src } of code) expect([f, src.match(/\bNumber\(|parseFloat|parseInt|BigInt\(|Math\.|toFixed|[=(,]\s*\+\s*\w+\.\w/g)]).toEqual([f, null]);
  });
});

describe("PF-B ruling: no brass on the row, neutral steel chips", () => {
  it("positions.css never references --acc", () => expect(css).not.toMatch(/--acc/));
  it("positions code never asks for an acc tone or wealth ctx", () => { for (const { src } of code) expect(src).not.toMatch(/tone="acc"|ctx="wealth"|ctx="hero"/); });
  it("pledged / lent chips: --steel border, --fg-muted text; halted chip --steel text", () => {
    expect(rule(".pos .chip.pos-chip")).toMatch(/border-color: var\(--steel\); color: var\(--fg-muted\)/);
    expect(rule(".pos .chip.pos-halted")).toMatch(/color: var\(--steel\)/);
  });
  it("margin chips: CALL --signal, alert --loss, CLOSED --fg-disabled; approx. small caps --fg-muted", () => {
    expect(rule(".pos .chip.pos-margin-call")).toContain("var(--signal)");
    expect(rule(".pos .chip.pos-margin-alert")).toContain("var(--loss)");
    expect(rule(".pos .chip.pos-margin-closed")).toContain("var(--fg-disabled)");
    expect(css).toMatch(/\.pos-liq-label, \.pos-approx \{ color: var\(--fg-muted\)/);
    expect(rule(".pos-approx")).toContain("small-caps");
  });
});

describe("layout hooks", () => {
  it("PF-3-06 stale Last is --fg-disabled", () => expect(rule(".pos-stale")).toContain("var(--fg-disabled)"));
  it("PF-3-08 Weight hides first (< 640 px), then Avg cost + Last (< 560 px); 36 px rows", () => {
    expect(css).toMatch(/@container \(max-width: 639px\) \{ \.pos-col-weight \{ display: none; \} \}/);
    expect(css).toMatch(/@container \(max-width: 559px\) \{ \.pos-col-avg, \.pos-col-last \{ display: none; \} \}/);
    expect(rule(".pos-tr")).toContain("height: 36px");
  });
  it("cards: value in --fg; 3 fixed lines with a 12 px gap and no wrap; margin chips small caps", () => {
    expect(rule(".pos-card .pos-value .money")).toContain("color: var(--fg)");
    expect(rule(".pos-line")).toContain("column-gap: var(--sp-12)");
    expect(rule(".pos-line")).toContain("flex-wrap: nowrap");
    expect(rule(".pos.pos-phone.pos-big")).toContain("padding-inline: 0"); // the app screen keeps the 16 px side margin
    expect(rule(".pos .chip.pos-margin")).toContain("font-variant-caps: all-small-caps");
  });
  it("PF-3-09 cards ≥ 56 px; amounts nowrap; no tick flash (no transition / animation)", () => {
    expect(rule(".pos-card")).toContain("min-height: 56px");
    expect(rule(".pos-card .money, .pos-card .num")).toContain("white-space: nowrap");
    expect(css).not.toMatch(/transition|animation|@keyframes/);
  });
  it("PF-3-10 gain/loss colour comes from the shared .gain/.loss classes (tokens the cb pair overrides)", () => {
    const shell = readFileSync("src/styles/shell.css", "utf8");
    expect(shell).toMatch(/\.gain \{ color: var\(--gain\); \}/);
    expect(shell).toMatch(/\.loss \{ color: var\(--loss\); \}/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("strings", () => {
  it("EN and FR have the same keys and no empty values", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(POS_STRINGS.fr)).toEqual(keys(POS_STRINGS.en));
    for (const [k, v] of Object.entries(POS_STRINGS.fr)) if (typeof v === "string") expect([k, v.length > 0]).toEqual([k, true]);
  });
  it("FR uses typographic apostrophes", () => {
    for (const v of Object.values(POS_STRINGS.fr)) if (typeof v === "string") expect(v).not.toContain("'");
  });
});

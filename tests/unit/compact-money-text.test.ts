// The shared floor compact formatter (src/components/ui/money.ts, from #70), kept from tests/unit/legacy/compact-money.test.ts when
// the legacy sim (src/game) was deleted (Phase 1 consolidation). The magnitude truncates toward zero for both signs
// (Studio ruling 2026-10-28, specs/ui-card-2-portfolio-overview.md): −412,860.15 -> −$412k.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MoneyText, type MoneyCtx } from "@/components/shell/MoneyText";
import { compactMoneyText } from "@/components/ui/money";

const M = "\u2212";

describe("compactMoneyText: MoneyText's abbreviating text as a string", () => {
  const cases: [string, string][] = [
    ["250000", "$250k"],
    ["1999999", "$1.99M"],
    ["412860.15", "$412k"],
    ["-412860.15", `${M}$412k`],
    ["-412000", `${M}$412k`],
    ["-412000.01", `${M}$412k`],
    ["4200000000000", "$4.2T"],
    ["10000", "$10k"],
    ["9999.99", "$9,999.99"],
    ["5000", "$5,000.00"],
    ["-42.1", `${M}$42.10`],
    ["0", "$0.00"],
    ["-0.00", "$0.00"],
  ];
  it.each(cases)("%s -> %s", (amount, text) => {
    expect(compactMoneyText(amount)).toBe(text);
  });
  it("matches what MoneyText renders for list, chip and sentence", () => {
    const rendered = (amount: string, ctx: MoneyCtx) =>
      renderToStaticMarkup(createElement(MoneyText, { amount, ctx })).replace(/<[^>]+>/g, "").replace(/&#x27;|&amp;/g, "");
    for (const [amount] of cases) for (const ctx of ["list", "chip", "sentence"] as const) expect(compactMoneyText(amount)).toBe(rendered(amount, ctx));
  });
});

describe("truncates instead of rounding", () => {
  it("±1,999,999 reads (−)$1.99M", () => {
    expect(compactMoneyText("1999999")).toBe("$1.99M");
    expect(compactMoneyText("-1999999")).toBe(`${M}$1.99M`);
  });
});

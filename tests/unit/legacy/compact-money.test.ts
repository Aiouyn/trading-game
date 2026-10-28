// Legacy number amounts on the shared compact formatter (src/components/ui/money.ts, from #70) through an exact
// decimal-string adapter (src/game/format.ts decimalString). The magnitude truncates toward zero for both signs
// (Studio ruling 2026-10-28, specs/ui-card-2-portfolio-overview.md): −412,860.15 -> −$412k.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MoneyText, type MoneyCtx } from "@/components/shell/MoneyText";
import { compactMoneyText } from "@/components/ui/money";
import * as legacyFormat from "@/game/format";
import { LICENSES, licenseRank, lockedText, type LicenseCheck } from "@/game/license";
import { RANKS } from "@/game/rank";

const { decimalString } = legacyFormat;
const M = "\u2212";

describe("decimalString: exact decimal string for a legacy number, no float arithmetic", () => {
  it.each([
    [250_000, "250000"],
    [20_000, "20000"],
    [2_000_000_000, "2000000000"],
    [0.1, "0.1"],
    [412_860.15, "412860.15"],
    [-412_860.15, "-412860.15"],
    [-1234.5, "-1234.5"],
    [0, "0"],
    [-0, "0"],
    [1e21, "1000000000000000000000"],
    [-4.2e21, "-4200000000000000000000"],
    [1.5e-7, "0.00000015"],
    [-2e-7, "-0.0000002"],
    [123456789012345680000, "123456789012345680000"],
  ])("%s -> %s", (n, s) => {
    expect(decimalString(n)).toBe(s);
  });
  it("rejects NaN and ±Infinity", () => {
    for (const n of [NaN, Infinity, -Infinity]) expect(() => decimalString(n)).toThrow(/finite/);
  });
  it("never goes through toFixed or rounding: 1.005 stays 1.005 (toFixed(2) would give 1.00)", () => {
    expect(decimalString(1.005)).toBe("1.005");
    expect((1.005).toFixed(2)).toBe("1.00");
  });
});

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

describe("legacy callers use the shared formatter; compactMoney is gone", () => {
  it("src/game/format.ts no longer exports compactMoney", () => {
    expect("compactMoney" in legacyFormat).toBe(false);
  });
  it("lockedText formats every license threshold as before ($20k / $250k / $5M / $100M), floored, from the exact string", () => {
    const lockedFor = (id: keyof typeof LICENSES) => {
      const rank = licenseRank(id);
      const c: Extract<LicenseCheck, { ok: false }> = { ok: false, license: LICENSES[id], rank, equity: 0, progress: 0 };
      return lockedText(c);
    };
    expect(lockedFor("pro")).toBe("Pro license at Owner, $250k");
    expect(lockedFor("derivatives")).toBe("Derivatives license at Operator, $5M");
    expect(lockedFor("institutional")).toBe("Institutional license at Mogul, $100M");
    expect(RANKS.filter((r) => r.threshold > 0).map((r) => compactMoneyText(decimalString(r.threshold)))).toEqual(["$20k", "$250k", "$5M", "$100M", "$2B"]);
  });
  it("truncates instead of rounding: ±1,999,999 reads (−)$1.99M where the deleted compactMoney read $2M", () => {
    expect(compactMoneyText(decimalString(1_999_999))).toBe("$1.99M");
    expect(compactMoneyText(decimalString(-1_999_999))).toBe(`${M}$1.99M`);
  });
});

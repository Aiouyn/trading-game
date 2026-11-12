// The M1-08 phone status-bar assertion must use the same chip formatting as MoneyText,
// not compare visible text to the full valuation (CI: $10k vs $10,000.58).
import { describe, expect, it } from "vitest";
import { compactMoneyText } from "@/components/ui/money";
import {
  actualChipFull,
  chipMatchesAmount,
  expectedChipMoney,
  fullMoneyText,
} from "../../helpers/m108-chip-money";

describe("M1-08 status-bar chip comparison", () => {
  it("under $10k: visible text is the full value and no title is required", () => {
    expect(expectedChipMoney("9999.99")).toEqual({ visible: "$9,999.99", full: "$9,999.99" });
    expect(compactMoneyText("9999.99")).toBe("$9,999.99");
    expect(chipMatchesAmount({ text: "$9,999.99", title: null }, "9999.99")).toBe(true);
    expect(chipMatchesAmount({ text: "$9,999.98", title: null }, "9999.99")).toBe(false);
  });

  it("at and over $10k: visible text is abbreviated and the full value is in title", () => {
    expect(expectedChipMoney("10000.00")).toEqual({ visible: "$10k", full: "$10,000.00" });
    expect(expectedChipMoney("10000.58")).toEqual({ visible: "$10k", full: "$10,000.58" });
    expect(chipMatchesAmount({ text: "$10k", title: "$10,000.00" }, "10000.00")).toBe(true);
    expect(chipMatchesAmount({ text: "$10k", title: "$10,000.58" }, "10000.58")).toBe(true);
  });

  it("the old visible-text === full-valuation check fails at $10,000.58", () => {
    const visible = compactMoneyText("10000.58");
    const full = fullMoneyText("10000.58");
    expect(visible).toBe("$10k");
    expect(full).toBe("$10,000.58");
    expect(visible === full).toBe(false);
    // The correct DOM (abbreviated text + title) still matches.
    expect(chipMatchesAmount({ text: visible, title: full }, "10000.58")).toBe(true);
    // The old e2e path (text only, no title) must not pass just because the letters are $10k.
    expect(chipMatchesAmount({ text: visible, title: null }, "10000.58")).toBe(false);
    expect(actualChipFull({ text: visible, title: null })).toBe("$10k");
  });

  it("rejects a wrong number even when the abbreviation matches", () => {
    // $10,099.99 also renders as $10k (the formatter truncates to 3 significant figures).
    expect(compactMoneyText("10099.99")).toBe("$10k");
    expect(chipMatchesAmount({ text: "$10k", title: "$10,099.99" }, "10000.58")).toBe(false);
    expect(chipMatchesAmount({ text: "$10,000.58", title: null }, "10000.58")).toBe(false);
  });
});

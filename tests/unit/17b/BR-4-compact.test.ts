// BR-4-15 (carry-over, card 2 ruling 2026-10-28): compact money truncates the magnitude toward zero for both signs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abbreviateDigits, compactMoneyText } from "@/components/ui/money";

describe("BR-4-15 abbreviateDigits truncates toward zero", () => {
  it.each([["-412000.01", "−$412k"], ["412999.99", "$412k"], ["-412860.15", "−$412k"], ["412860.15", "$412k"], ["-1999999", "−$1.99M"]])("%s → %s", (amount, out) => {
    expect(compactMoneyText(amount)).toBe(out);
  });
  it("digits only, one argument", () => {
    expect(abbreviateDigits("412999")).toBe("412k");
    expect(abbreviateDigits.length).toBe(1);
  });
  it("doc comment states the truncation rule", () => {
    expect(readFileSync("src/components/ui/money.ts", "utf8")).toMatch(/ALWAYS truncated toward zero whatever the sign/);
  });
});

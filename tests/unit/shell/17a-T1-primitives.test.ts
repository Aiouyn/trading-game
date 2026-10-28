// @vitest-environment happy-dom
// 17A T1: token parity (T1-01) and primitive behaviour (T1-06, T1-08, Button). Computed-style ACs live in
// tests/e2e/shell/17a-T1.spec.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MoneyText, speakMoney, type MoneyCtx, type MoneyTextProps } from "@/components/shell/MoneyText";
import { abbreviateDigits } from "@/components/ui/money";
import { Button } from "@/components/ui/Button";
import { MODE_SELECTORS, MODE_TOKENS, PALETTES, ROOT_TOKENS } from "@/styles/tokens";

const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

/** Every `selector { --name: value; }` block in tokens.css, comments stripped. */
function cssBlocks(): { selector: string; vars: Record<string, string> }[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    selector: sel.trim().replace(/\s+/g, " "),
    vars: Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])),
  }));
}

describe("T1-01 tokens.ts mirrors every var in tokens.css", () => {
  const blocks = cssBlocks().filter((b) => Object.keys(b.vars).length > 0);
  const mirrored = (selector: string): Record<string, string> | undefined => {
    if (selector === ":root") return ROOT_TOKENS;
    const mode = Object.entries(MODE_SELECTORS).find(([, s]) => s === selector)?.[0];
    if (mode) return (MODE_TOKENS as Record<string, Record<string, string>>)[mode];
    const pal = /data-palette="([\w-]+)"/.exec(selector)?.[1];
    return pal ? (PALETTES as Record<string, Record<string, string>>)[pal] : undefined;
  };
  it.each(blocks.map((b) => [b.selector, b] as const))("%s", (_sel, b) => {
    expect(mirrored(b.selector)).toEqual(b.vars);
  });
  it("includes the 17A additions", () => {
    expect(ROOT_TOKENS).toMatchObject({
      "focus-ring": "0 0 0 2px var(--bg0), 0 0 0 4px var(--acc)", "hit-touch": "44px", "hit-pointer": "28px",
      "tile-shelf": "40px", "tile-phone": "60px", "strip-h": "34px", "strip-h-focus": "24px", "shelf-h": "52px",
      "statusbar-h": "44px", "appbar-h": "44px",
    });
    expect(MODE_TOKENS.colorBlind).toEqual({ gain: "#5CE1E6", loss: "#FF5C8A" });
    expect(MODE_TOKENS.highContrast).toEqual({ line: "var(--fg-disabled)" });
  });
});

const html = (amount: string, ctx?: MoneyCtx, extra: Partial<MoneyTextProps> = {}) =>
  renderToStaticMarkup(createElement(MoneyText, { amount, ctx, ...extra }));
const text = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

describe("T1-06 MoneyText formatting", () => {
  it.each([["12400", "$12.4k"], ["3210000", "$3.21M"], ["1050000000", "$1.05B"], ["4200000000000", "$4.2T"]])("list %s -> %s", (a, want) => {
    expect(text(html(a, "list"))).toBe(want);
  });
  it("chip and sentence abbreviate too; below 10,000 stays full", () => {
    expect(text(html("12400", "chip"))).toBe("$12.4k");
    expect(text(html("12499.99", "chip"))).toBe("$12.4k"); // rounds down, never up
    expect(text(html("12400", "sentence"))).toBe("$12.4k");
    expect(text(html("9999.99", "list"))).toBe("$9,999.99");
  });
  it("abbreviated values keep full precision in title", () => {
    expect(html("3210000", "list")).toContain('title="$3,210,000.00"');
  });
  it("a negative abbreviated value's title keeps the minus (QA #76 follow-up): -412,000.01 -> −$412,000.01", () => {
    expect(html("-412000.01", "list")).toContain('title="\u2212$412,000.01"');
    expect(html("-412000.01", "chip")).toContain('title="\u2212$412,000.01"');
    expect(html("-412000.01", "list")).not.toContain('title="$412,000.01"');
  });
  it("table keeps full precision", () => {
    expect(text(html("4200000000000", "table"))).toBe("$4,200,000,000,000.00");
  });
  it("negatives use U+2212 and --loss", () => {
    const m = html("-42.10", "table");
    expect(text(m)).toBe("\u2212$42.10");
    expect(m).toContain("loss");
  });
  it("zero renders $0.00 in --fg-muted with no sign, even as a delta", () => {
    for (const ctx of ["list", "delta", "hero"] as const) {
      const m = html("0", ctx);
      expect(text(m)).toBe("$0.00");
      expect(m).toContain("muted");
    }
  });
  it("positive delta gets + and --gain; wealth uses --acc-wealth; estimated gets ≈ and muted", () => {
    expect(text(html("12.5", "delta"))).toBe("+$12.50");
    expect(html("12.5", "delta")).toContain("gain");
    expect(html("1", "wealth")).toContain("money-wealth-tone");
    const est = html("1284.10", "table", { estimated: true });
    expect(text(est)).toBe("≈$1,284.10");
    expect(est).toContain("muted");
  });
  it("restricted cash shows a steel-outline pill beside it, never brass (Studio PF fix a)", () => {
    const m = html("500", "list", { restricted: "AD_GRANT" });
    expect(m).toMatch(/class="chip chip-steel chip-outline">AD</);
    expect(m).not.toContain("chip-acc");
    expect(text(html("2500", "list", { restricted: "FRESH_START" }))).toBe("$2,500.00START");
    expect(text(html("2500", "list", { restricted: "FRESH_START", locale: "fr" }))).toBe("$2,500.00START");
  });
  // The one compact-money formatter for wealth (Studio #67 condition): 3 significant figures, always rounded DOWN.
  it.each([
    ["99950", "99.9k"], ["999500", "999k"], ["999999", "999k"], ["1000000", "1M"], ["1999999", "1.99M"], ["123456", "123k"],
    ["10000", "10k"], ["10099", "10k"], ["412860", "412k"], ["999999999999", "999B"], ["1234567890123456", "1234T"],
  ])("floors %s -> %s", (a, want) => {
    expect(abbreviateDigits(a)).toBe(want);
  });
  // Studio sign ruling 2026-10-28 (specs/ui-card-2-portfolio-overview.md): the magnitude truncates toward zero for both
  // signs, so a negative reads the same digits as its positive, behind U+2212. Cents never round the magnitude up.
  it.each([
    ["412860.15", "\u2212$412k"], ["412000.01", "\u2212$412k"], ["412999.99", "\u2212$412k"], ["999999.99", "\u2212$999k"],
    ["10000.50", "\u2212$10k"], ["999999999999.99", "\u2212$999B"], ["1999999", "\u2212$1.99M"],
  ])("negatives truncate toward zero: −%s -> %s", (a, want) => {
    expect(text(html(`-${a}`, "chip"))).toBe(want);
    expect(text(html(a, "chip"))).toBe(want.slice(1));
  });
  it("wealth: status strip, phone status bar and home widget all read $412k for $412,860.15; −$412k when negative", () => {
    expect(text(html("412860.15", "chip"))).toBe("$412k");
    expect(text(html("412999.99", "chip"))).toBe("$412k");
    expect(text(html("-412860.15", "chip"))).toBe("\u2212$412k");
    expect(text(html("-412000.01", "chip"))).toBe("\u2212$412k");
    expect(text(html("1999999", "chip"))).toBe("$1.99M");
  });
  it("no FR variant yet: the compact form is the same digits for FR prefs (flagged for the i18n pass)", () => {
    expect(text(html("412860.15", "chip", { locale: "fr" }))).toBe("$412k");
  });
  it("rejects non-decimal input instead of guessing", () => {
    expect(() => html("12e3")).toThrow();
  });
});

describe("T1-08 MoneyText speech", () => {
  it("−42.10 FDL reads 'minus 42.10 dollars'", () => {
    expect(speakMoney("-42.10")).toBe("minus 42.10 dollars");
    expect(html("-42.10", "table")).toContain('aria-label="minus 42.10 dollars"');
  });
  it("estimated reads 'about …'", () => expect(speakMoney("5", true)).toBe("about 5.00 dollars"));
});

describe("Button", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const mount = (...els: ReturnType<typeof createElement>[]) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(createElement("div", null, ...els)));
    return { host, unmount: () => act(() => root.unmount()) };
  };

  it("disabled stays focusable (aria-disabled) and ignores activation", () => {
    const onClick = vi.fn();
    const { host, unmount } = mount(createElement(Button, { disabled: true, onClick }, "Go"));
    const b = host.querySelector("button")!;
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(false);
    act(() => b.click());
    expect(onClick).not.toHaveBeenCalled();
    unmount();
  });

  it("warns in dev when two primaries share one view, not for one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const one = mount(createElement(Button, { variant: "primary" }, "A"));
    expect(warn).not.toHaveBeenCalled();
    one.unmount();
    document.body.innerHTML = "";
    const two = mount(createElement(Button, { variant: "primary", key: 1 }, "A"), createElement(Button, { variant: "primary", key: 2 }, "B"));
    expect(warn).toHaveBeenCalled();
    two.unmount();
    warn.mockRestore();
  });

  it("renders variant and size classes", () => {
    const m = renderToStaticMarkup(createElement(Button, { variant: "ghost", size: "sm" }, "x"));
    expect(m).toContain('class="btn btn-ghost btn-sm"');
    expect(m).toContain('type="button"');
  });
});

// Studio T1 ruling 7: direction beats certainty.
import { renderToStaticMarkup as _r } from "react-dom/server";
import { createElement as _c } from "react";
import { MoneyText as _M } from "@/components/shell/MoneyText";
describe("ruling 7: estimated tone", () => {
  const cls = (amount: string, ctx?: "delta" | "list") => /class="([^"]*)"/.exec(_r(_c(_M, { amount, ctx, estimated: true })))![1].split(" ");
  it("estimated negative is loss, not muted", () => { expect(cls("-12.50")).toContain("loss"); expect(cls("-12.50")).not.toContain("muted"); });
  it("estimated zero and neutral values are muted", () => { expect(cls("0", "delta")).toContain("muted"); expect(cls("12.50")).toContain("muted"); });
  it("estimated positive delta is gain with the ≈ prefix (Studio answer 3)", () => {
    expect(cls("12.50", "delta")).toContain("gain");
    expect(cls("12.50", "delta")).not.toContain("muted");
    expect(_r(_c(_M, { amount: "12.50", ctx: "delta", estimated: true }))).toContain("≈+$12.50");
  });
  it("keeps the ≈ prefix", () => expect(_r(_c(_M, { amount: "-12.50", estimated: true }))).toContain("≈−$12.50"));
});

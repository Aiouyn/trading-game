// Card 10 + batch 1: a standalone install has to see safe-area insets, and phone chrome
// has to stay clear of the notch, landscape side insets, and the home indicator.
// These read the source so a later edit cannot drop either piece.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR_SCHEME, PALETTE_IDS } from "@/styles/tokens";
import { statusBarStyleForPalette } from "@/shell/appearance";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const block = (css: string, sel: string) => css.match(new RegExp(`${sel}\\s*\\{[^}]+\\}`))?.[0] ?? "";

describe("standalone safe-area", () => {
  it("the viewport asks for cover so env(safe-area-inset-*) can be non-zero when installed", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toMatch(/viewportFit:\s*"cover"/);
    expect(src).toMatch(/appleWebApp/);
    expect(src).toMatch(/black-translucent/);
  });

  it("the phone status bar is 44 px plus the top inset, so the mark and clock sit below the notch", () => {
    const css = read("src/styles/nav.css");
    const b = block(css, "\\.statusbar");
    expect(b).toMatch(/env\(safe-area-inset-top/);
    expect(b).toMatch(/safe-area-inset-left/);
    expect(b).toMatch(/safe-area-inset-right/);
    expect(b).toMatch(/var\(--statusbar-h\)/);
  });

  it("the edge bar keeps the bottom inset that cover will finally honor", () => {
    const css = read("src/styles/nav.css");
    const b = block(css, "\\.edge-bar");
    expect(b).toMatch(/env\(safe-area-inset-bottom/);
  });

  it("home, the dock and the app body use max(existing padding, env()) on the left and right", () => {
    const css = read("src/styles/nav.css");
    for (const sel of ["\\.phone-home", "\\.phone-appbody", "\\.bottom-row", "\\.appbar"]) {
      const b = block(css, sel);
      expect(b, sel).toMatch(/env\(safe-area-inset-left/);
      expect(b, sel).toMatch(/env\(safe-area-inset-right/);
      expect(b, sel).toMatch(/max\(/);
    }
  });

  it("the Wire app-body override keeps left/right insets when it zeroes the 16 px padding", () => {
    const css = read("src/apps/wire/skeleton.css");
    const b = block(css, "\\.phone-appbody:has\\(> \\.wire\\)");
    expect(b).toMatch(/env\(safe-area-inset-left/);
    expect(b).toMatch(/env\(safe-area-inset-right/);
  });

  it("the trade-bar box clears the sides via the app body, not only FAB padding of env() - 16px", () => {
    const bar = block(read("src/apps/broker/broker.css"), "\\.br-trade-bar");
    const body = block(read("src/styles/nav.css"), "\\.phone-appbody");
    expect(body).toMatch(/env\(safe-area-inset-left/);
    expect(body).toMatch(/env\(safe-area-inset-right/);
    // The previous formula inset only the button, so the bar background still ran under the sides.
    expect(bar).not.toMatch(/env\(safe-area-inset-right\)\s*-\s*var\(--sp-16\)/);
    expect(bar).not.toMatch(/env\(safe-area-inset-left\)\s*-\s*var\(--sp-16\)/);
  });

  it("the bottom sheet carries the home-indicator inset, so 'Nothing open yet.' is not in that zone", () => {
    const css = read("src/styles/notices.css");
    const b = block(css, "\\.qs-bottom");
    expect(b).toMatch(/env\(safe-area-inset-bottom/);
    // Parent now owns the inset; the ticket body must not add it again.
    const ticket = block(read("src/apps/broker/broker.css"), "\\.br-phone-order \\.qs-body");
    expect(ticket).not.toMatch(/max\(\s*var\(--sp-16\),\s*env\(safe-area-inset-bottom\)/);
  });

  it("inset formulas also honour --sa-* stand-ins so Playwright can exercise 47/34 without a real env()", () => {
    const nav = read("src/styles/nav.css");
    const notices = read("src/styles/notices.css");
    const wire = read("src/apps/wire/skeleton.css");
    expect(nav).toMatch(/var\(--sa-top,\s*0px\)/);
    expect(nav).toMatch(/var\(--sa-right,\s*0px\)/);
    expect(nav).toMatch(/var\(--sa-bottom,\s*0px\)/);
    expect(nav).toMatch(/var\(--sa-left,\s*0px\)/);
    expect(notices).toMatch(/var\(--sa-bottom,\s*0px\)/);
    expect(wire).toMatch(/var\(--sa-left,\s*0px\)/);
    expect(wire).toMatch(/var\(--sa-right,\s*0px\)/);
  });

  it("the root layout emits apple-mobile-web-app-capable=yes (Next 16 only emits the unprefixed name)", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toMatch(/<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"\s*\/>/);
  });

  it("light palettes use the default iOS status bar (dark text); dark palettes stay black-translucent", () => {
    for (const p of PALETTE_IDS) {
      const want = COLOR_SCHEME[p] === "light" ? "default" : "black-translucent";
      expect(statusBarStyleForPalette(p), p).toBe(want);
    }
    expect(statusBarStyleForPalette("broadsheet")).toBe("default");
    expect(statusBarStyleForPalette("ink-brass")).toBe("black-translucent");
  });
});

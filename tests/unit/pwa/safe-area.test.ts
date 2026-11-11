// Card 10: a standalone install has to see safe-area insets, and the 44 px phone status bar
// has to sit below the notch. These read the source so a later edit cannot drop either piece.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

describe("standalone safe-area", () => {
  it("the viewport asks for cover so env(safe-area-inset-*) can be non-zero when installed", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toMatch(/viewportFit:\s*"cover"/);
    expect(src).toMatch(/appleWebApp/);
    expect(src).toMatch(/black-translucent/);
  });

  it("the phone status bar is 44 px plus the top inset, so the mark and clock sit below the notch", () => {
    const css = read("src/styles/nav.css");
    const block = css.match(/\.statusbar\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/env\(safe-area-inset-top/);
    expect(block).toMatch(/safe-area-inset-left/);
    expect(block).toMatch(/safe-area-inset-right/);
    expect(block).toMatch(/var\(--statusbar-h\)/);
  });

  it("the edge bar keeps the bottom inset that cover will finally honor", () => {
    const css = read("src/styles/nav.css");
    const block = css.match(/\.edge-bar\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/env\(safe-area-inset-bottom/);
  });
});

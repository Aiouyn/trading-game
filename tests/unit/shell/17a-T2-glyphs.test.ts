// 17A T2-05: every AppId has a dedicated glyph (never the `app` fallback); glyph SVGs are 1.5 px, round, unfilled.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Glyph, glyphPaths } from "@/components/shell/Glyph";
import { UI_GLYPHS } from "@/components/shell/glyphs/ui";
import { APPS, type AppId } from "@/shell/registry";

const APP_ORDER = Object.keys(APPS) as AppId[];

describe("T2-05 app glyphs", () => {
  it("covers all 32 apps", () => expect(APP_ORDER).toHaveLength(32));

  it.each(APP_ORDER.map((a) => [a]))("%s has its own glyph, not the fallback", (app) => {
    const paths = glyphPaths(app);
    expect(paths).not.toEqual(UI_GLYPHS.app);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("no two apps share a glyph", () => {
    const keys = APP_ORDER.map((a) => glyphPaths(a).join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(APP_ORDER.map((a) => [a]))("%s svg is stroke-width 1.5, round caps/joins, fill none", (app) => {
    const svg = renderToStaticMarkup(createElement(Glyph, { name: app }));
    expect(svg).toContain('stroke-width="1.5"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg).toContain('fill="none"');
    expect(svg).not.toMatch(/<path[^>]*fill=/);
  });

  it("quay keeps its two strokes, the second at opacity 0.55", () => {
    const svg = renderToStaticMarkup(createElement(Glyph, { name: "quay" }));
    expect(svg.match(/<path/g)).toHaveLength(2);
    expect(svg).toMatch(/<path[^>]*opacity="0.55"/);
  });
});

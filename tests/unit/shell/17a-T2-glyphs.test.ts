// 17A T2-05 + Studio T2 ruling 5: every glyph is a named export in glyphs/apps.ts or glyphs/ui.ts, every AppId
// and every UI glyph name resolves to its own paths (never the `app` placeholder), and SVGs are 1.5 px,
// round, unfilled.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Glyph, glyphPaths, type GlyphName } from "@/components/shell/Glyph";
import * as appsFile from "@/components/shell/glyphs/apps";
import * as uiFile from "@/components/shell/glyphs/ui";
import { APPS, type AppId } from "@/shell/registry";

const APP_IDS = Object.keys(APPS) as AppId[];
const named = (mod: Record<string, unknown>) =>
  Object.entries(mod).filter(([, v]) => Array.isArray(v) || typeof v === "string") as [string, readonly string[] | string][];
const PLACEHOLDER = uiFile.app;

describe("glyph files: named exports, no placeholder fallback", () => {
  it("covers all 32 apps", () => expect(APP_IDS).toHaveLength(32));

  it("APP_GLYPHS holds exactly the named exports of apps.ts, one per AppId", () => {
    const exports = Object.fromEntries(named(appsFile));
    expect(Object.keys(exports).sort()).toEqual([...APP_IDS].sort());
    for (const a of APP_IDS) expect(appsFile.APP_GLYPHS[a]).toBe(exports[a]);
  });

  it("UI_GLYPHS and SMALL_GLYPHS hold exactly the named exports of ui.ts", () => {
    const exports = named(uiFile).map(([k]) => k).sort();
    expect([...Object.keys(uiFile.UI_GLYPHS), ...Object.keys(uiFile.SMALL_GLYPHS)].sort()).toEqual(exports);
  });

  it.each([...APP_IDS, ...Object.keys(uiFile.UI_GLYPHS).filter((k) => k !== "app")].map((n) => [n]))("%s resolves to its own paths, not the placeholder", (name) => {
    const paths = glyphPaths(name as Exclude<GlyphName, keyof typeof uiFile.SMALL_GLYPHS>);
    expect(paths).not.toEqual(PLACEHOLDER);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("no two app glyphs share paths (Estate is distinct from Contracts and Property)", () => {
    const keys = APP_IDS.map((a) => glyphPaths(a).join("|"));
    expect(new Set(keys).size).toBe(keys.length);
    expect(glyphPaths("estate")).not.toEqual(glyphPaths("contracts"));
    expect(glyphPaths("estate")).not.toEqual(glyphPaths("property"));
  });

  it.each(APP_IDS.map((a) => [a]))("%s svg is stroke-width 1.5, round caps/joins, fill none", (app) => {
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

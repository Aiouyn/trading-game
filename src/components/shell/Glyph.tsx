// Quay glyph family (17 §3.15): 24 px grid, 1.5 px line, round caps and joins. Every AppId has a dedicated
// glyph (glyphs/apps.ts); the neutral `app` frame remains only as a defensive fallback.
import type { AppId } from "@/shell/registry";
import { APP_GLYPHS } from "./glyphs/apps";
import { SMALL_GLYPHS, UI_GLYPHS } from "./glyphs/ui";

export type GlyphName = AppId | keyof typeof UI_GLYPHS | keyof typeof SMALL_GLYPHS;

const isSmall = (n: GlyphName): n is keyof typeof SMALL_GLYPHS => n in SMALL_GLYPHS;

/** Path data for a 24 px glyph; unknown names fall back to `app`. */
export function glyphPaths(name: Exclude<GlyphName, keyof typeof SMALL_GLYPHS>): readonly string[] {
  return (APP_GLYPHS as Record<string, readonly string[]>)[name] ?? (UI_GLYPHS as Record<string, readonly string[]>)[name] ?? UI_GLYPHS.app;
}

export function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  if (isSmall(name)) {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round">
        <path d={SMALL_GLYPHS[name]} />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" data-glyph={name}>
      {glyphPaths(name).map((d, i) => <path key={i} d={d} opacity={name === "quay" && i === 1 ? 0.55 : 1} />)}
    </svg>
  );
}

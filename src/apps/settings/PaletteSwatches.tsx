"use client";
// SET-02a: four palette swatches, each a mini window drawn with its own palette's tokens (scoped data-palette).
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import type { CSSProperties } from "react";
import { PALETTE_IDS, PALETTES, type PaletteId } from "@/styles/tokens";

// tokens.css scopes palettes on <html>, so the swatch re-declares the tokens it draws with from tokens.ts.
const scoped = (p: PaletteId): CSSProperties => Object.fromEntries((["bg0", "win", "acc", "gain", "loss", "line"] as const).map((k) => [`--${k}`, PALETTES[p][k]])) as CSSProperties;
import { useSettingsStrings } from "./useSettingsStrings";

export function PaletteSwatches() {
  const t = useSettingsStrings();
  const store = useShellStore();
  const palette = useShell((s) => s.local.palette);
  return (
    <div className="swatches" role="radiogroup" aria-label={t.palette} data-testid="palette-swatches">
      {PALETTE_IDS.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={palette === p} className="swatch" data-testid={`swatch-${p}`}
          tabIndex={palette === p ? 0 : -1}
          onClick={() => store.getState().setPalette(p)}
          onKeyDown={(e) => {
            const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const next = PALETTE_IDS[(PALETTE_IDS.indexOf(palette) + d + PALETTE_IDS.length) % PALETTE_IDS.length];
            store.getState().setPalette(next);
            (e.currentTarget.parentElement?.querySelector(`[data-testid="swatch-${next}"]`) as HTMLElement | null)?.focus();
          }}>
          <span className="swatch-mini" data-palette={p} style={scoped(p)} data-testid={`swatch-mini-${p}`} aria-hidden="true">
            <span className="swatch-win"><span className="swatch-acc" /><span className="swatch-ticks"><i className="g" /><i className="l" /></span></span>
          </span>
          <span className="swatch-name">{t.paletteNames[p]}</span>
        </button>
      ))}
    </div>
  );
}

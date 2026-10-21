"use client";
// Settings placeholder: palette, motion and transparency only (the rest of SET is out of scope).
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { S } from "@/shell/strings";
import { PALETTE_IDS, type PaletteId } from "@/styles/tokens";

const PALETTE_NAMES: Record<PaletteId, string> = { "ink-brass": "Ink & Brass", broadsheet: "Broadsheet", phosphor: "Phosphor", riviera: "Riviera" };
const MODES = ["system", "on", "off"] as const;
const SCALES = [1, 1.25, 1.5, 1.75, 2] as const;

export function SettingsApp() {
  const store = useShellStore();
  const palette = useShell((s) => s.local.palette);
  const prefs = useShell((s) => s.prefs);
  return (
    <section className="settings">
      <h2 className="section-title">{S.settingsPalette}</h2>
      <div className="seg" role="radiogroup" aria-label={S.settingsPalette}>
        {PALETTE_IDS.map((p) => (
          <button key={p} role="radio" aria-checked={palette === p} className={palette === p ? "on" : ""} onClick={() => store.getState().setPalette(p)}>
            {PALETTE_NAMES[p]}
          </button>
        ))}
      </div>
      <label className="row">
        <span>{S.settingsMotion}</span>
        <select value={prefs.reducedMotion} onChange={(e) => store.getState().setPrefs({ reducedMotion: e.target.value as (typeof MODES)[number] })}>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="row">
        <span>{S.settingsTransparency}</span>
        <select value={prefs.reducedTransparency} onChange={(e) => store.getState().setPrefs({ reducedTransparency: e.target.value as (typeof MODES)[number] })}>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="row">
        <span>{S.textScale}</span>
        <select data-testid="text-scale" value={prefs.textScale} onChange={(e) => store.getState().setPrefs({ textScale: Number(e.target.value) })}>
          {SCALES.map((v) => <option key={v} value={v}>{`${Math.round(v * 100)}%`}</option>)}
        </select>
      </label>
    </section>
  );
}

"use client";
// SET-02 Appearance (17 §7.2, §3.3.1, §3.12, §3.16). Applies instantly; no Save button [P].
import { useSyncExternalStore } from "react";
import { Label } from "@/components/ui/Label";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import type { AccountUiPrefs } from "@/shell/types";
import { AppearancePreview } from "./AppearancePreview";
import { Segment, Switch } from "./controls";
import { PaletteSwatches } from "./PaletteSwatches";
import { ShellPicker } from "./ShellPicker";
import { useSettingsStrings } from "./useSettingsStrings";

type Mode = AccountUiPrefs["reducedMotion"];
/** Studio #38: segments stack from text scale 1.5 (same threshold as the icon-only dock), or whenever a row would overflow. */
export const STACK_AT = 1.5;

function useMedia(q: string): boolean {
  return useSyncExternalStore(
    (f) => { const m = window.matchMedia(q); m.addEventListener("change", f); return () => m.removeEventListener("change", f); },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

export function Appearance() {
  const t = useSettingsStrings();
  const store = useShellStore();
  const prefs = useShell((s) => s.prefs);
  const osMotion = useMedia("(prefers-reduced-motion: reduce)");
  const osTransp = useMedia("(prefers-reduced-transparency: reduce)");
  const modes = (["system", "on", "off"] as const).map((id) => ({ id, label: t.modes[id] }));
  const set = store.getState().setPrefs;
  const modeRow = (label: string, key: "reducedMotion" | "reducedTransparency", os: boolean) => (
    <div className="set-block">
      <span className="set-row-label">{label}</span>
      <Segment<Mode> label={label} value={prefs[key]} options={modes} onChange={(v) => set({ [key]: v })} testId={`seg-${key}`} stacked={prefs.textScale >= STACK_AT} />
      {prefs[key] === "system" && <p className="muted set-hint" data-testid={`os-${key}`}>{t.systemState(os)}</p>}
    </div>
  );
  return (
    <div className="appearance" data-testid="appearance">
      <section aria-labelledby="ap-palette">
        <Label id="ap-palette">{t.palette}</Label>
        <PaletteSwatches />
        <p className="muted set-hint">{t.paletteHint}</p>
      </section>
      <section aria-labelledby="ap-shell">
        <Label id="ap-shell">{t.shell}</Label>
        <ShellPicker />
      </section>
      <section><AppearancePreview /></section>
      <section>
        <Switch label={t.highContrast} checked={prefs.highContrast} onChange={(v) => set({ highContrast: v })} testId="switch-hc" />
        <Switch label={t.colorBlind} checked={prefs.colorBlindPair} onChange={(v) => set({ colorBlindPair: v })} testId="switch-cb" />
        <p className="muted set-hint">
          {t.colorBlindHint}{" "}
          <button type="button" className="set-link" data-testid="use-phosphor" onClick={() => store.getState().setPalette("phosphor")}>{t.usePhosphor}</button>
        </p>
      </section>
      <section>
        {modeRow(t.reduceMotion, "reducedMotion", osMotion)}
        {modeRow(t.reduceTransparency, "reducedTransparency", osTransp)}
      </section>
    </div>
  );
}

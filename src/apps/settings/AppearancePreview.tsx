"use client";
// SET-02c: text-scale slider with a live preview. The preview follows while dragging; the UI applies on release.
import { useState } from "react";
import { Label } from "@/components/ui/Label";
import { MoneyText } from "@/components/shell/MoneyText";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { useSettingsStrings } from "./useSettingsStrings";

export function AppearancePreview() {
  const t = useSettingsStrings();
  const store = useShellStore();
  const applied = useShell((s) => s.prefs.textScale);
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? applied;
  const commit = () => { if (draft !== null) { store.getState().setPrefs({ textScale: draft }); setDraft(null); } };
  return (
    <div className="scale">
      <div className="set-row">
        <label htmlFor="text-scale" className="set-row-label">{t.textScale}</label>
        <span className="num" aria-hidden="true">{`${Math.round(value * 100)}%`}</span>
      </div>
      <input id="text-scale" data-testid="text-scale" type="range" min={1} max={2} step={0.25} value={value}
        aria-valuetext={t.percent(Math.round(value * 100))}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <div className="preview" data-testid="scale-preview" style={{ ["--text-scale" as string]: String(value) }} aria-label={t.previewLabel} role="group">
        <Label>{t.previewNw}</Label>
        <div className="preview-hero"><MoneyText amount="412860.15" ctx="hero" /></div>
        <div className="preview-row"><span>{t.previewRow}</span><span className="num"><MoneyText amount="1240.50" ctx="list" /></span></div>
      </div>
    </div>
  );
}

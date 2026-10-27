"use client";
// SET-02b: earned + owned shells. Selecting sets prefs.shell; applyAppearance applies it (or falls back to rank).
import { Chip } from "@/components/ui/Chip";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { availableShells, chosenShell } from "@/shell/appearance";
import { ownedShells, type ShellId } from "@/shell/channels";
import { RANK_NAMES, RANKS } from "@/shell/registry";
import { useSettingsStrings } from "./useSettingsStrings";

export function ShellPicker() {
  const t = useSettingsStrings();
  const store = useShellStore();
  const rank = useShell((s) => s.channels.rank);
  const ent = useShell((s) => s.channels.entitlements);
  const prefs = useShell((s) => s.prefs);
  const shells = availableShells(rank, ent);
  const owned = ownedShells(ent);
  const current = chosenShell(prefs, rank, ent);
  const name = (id: ShellId) => {
    const m = /^r([0-6])$/.exec(id);
    return m ? t.shellName(Number(m[1]), RANK_NAMES[RANKS[Number(m[1])]]) : t.cosmeticName(id);
  };
  return (
    <div className="shells" role="radiogroup" aria-label={t.shell} data-testid="shell-list">
      {shells.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={current === id} className="shell-row" data-testid={`shell-${id}`}
          tabIndex={current === id ? 0 : -1} onClick={() => store.getState().setPrefs({ shell: id })}>
          {/* Thumbnail placeholder until Studio supplies hardware art (17 §3.12). */}
          <span className="shell-thumb" role="img" aria-label={t.shellThumb} />
          <span className="shell-name">{name(id)}</span>
          {id.startsWith("cos_shell_") && owned.includes(id) && <Chip tone="neutral" data-testid="purchased">{t.purchased}</Chip>}
        </button>
      ))}
    </div>
  );
}

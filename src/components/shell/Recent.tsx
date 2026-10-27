"use client";
import { APP_NAMES, S } from "@/shell/strings";
import { Sheet } from "./Sheet";
import { useShell, useShellStore } from "./ShellContext";

/** Recent: bottom sheet with up to 6 running apps (17 §3.2.3), on the shared T5 <Sheet> (focus trap, Esc / scrim). */
export function Recent() {
  const store = useShellStore();
  const recent = useShell((s) => s.recent);
  return (
    <Sheet side="bottom" label={S.recent} onClose={() => store.getState().setRecent(false)} testId="recent">
      <h2 className="label" id="recent-title">{S.recent}</h2>
      {recent.length === 0 && <p className="muted">{S.noRecent}</p>}
      <ul className="recent-list">
        {recent.slice(0, 6).map((a) => (
          <li key={a}><button data-testid="recent-item" onClick={() => store.getState().open(a)}>{APP_NAMES[a]}</button></li>
        ))}
      </ul>
    </Sheet>
  );
}

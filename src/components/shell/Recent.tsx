"use client";
import { APP_NAMES, S } from "@/shell/strings";
import { useShell, useShellStore } from "./ShellContext";

/** Recent: bottom sheet with up to 6 running apps (17 §3.2.3). */
export function Recent() {
  const store = useShellStore();
  const recent = useShell((s) => s.recent);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && store.getState().setRecent(false)}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="recent-title" data-testid="recent">
        <h2 className="label" id="recent-title">{S.recent}</h2>
        {recent.length === 0 && <p className="muted">{S.noRecent}</p>}
        <ul>
          {recent.slice(0, 6).map((a) => (
            <li key={a}><button data-testid="recent-item" onClick={() => store.getState().open(a)}>{APP_NAMES[a]}</button></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

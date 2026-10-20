"use client";
import { useState } from "react";
import { LAYOUTS } from "@/shell/layouts";
import { shelfOrder } from "@/shell/prefs";
import { APP_IDS, APPS } from "@/shell/registry";
import { workspacesFor } from "@/shell/store";
import { APP_NAMES, S } from "@/shell/strings";
import { viewportOf } from "@/shell/wm";
import { Glyph } from "./Glyph";
import { useShell, useShellStore } from "./ShellContext";

export function Shelf() {
  const store = useShellStore();
  const vis = useShell((s) => s.vis);
  const fresh = useShell((s) => s.fresh);
  const windows = useShell((s) => s.local.windows);
  const ws = useShell((s) => s.local.activeWorkspace);
  const rank = useShell((s) => s.channels.rank.rank);
  const vw = useShell((s) => s.vw);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const apps = shelfOrder(APP_IDS).filter((a) => vis[a] !== "hidden");
  const top = windows.at(-1);
  const desktop = viewportOf(vw) === "desktop";

  return (
    <nav className="shelf" role="toolbar" aria-label={S.shelf} data-testid="shelf">
      <div className="shelf-tiles">
      {apps.map((a, i) => {
        const locked = vis[a] === "locked";
        const running = windows.some((w) => w.app === a);
        const divider = i > 0 && APPS[apps[i - 1]].group !== APPS[a].group;
        return (
          <span key={a} className="shelf-slot">
            {divider && <span className="shelf-divider" data-testid="group-divider" aria-hidden="true" />}
            <button
              className={`tile${locked ? " locked" : ""}${running ? " run" : ""}${top?.app === a ? " on" : ""}`}
              data-testid={`tile-${a}`}
              data-state={vis[a]}
              aria-label={locked ? `${APP_NAMES[a]} · ${APPS[a].lockHint}` : APP_NAMES[a]}
              aria-disabled={locked}
              title={locked ? APPS[a].lockHint : APP_NAMES[a]}
              onClick={() => !locked && store.getState().open(a)}
            >
              <Glyph name={a} size={20} />
              {locked && <span className="lock-tag">{APPS[a].lockLabel}</span>}
              {fresh.has(a) && <span className="fresh-dot" data-testid={`fresh-${a}`} />}
              {running && <span className="run-dot" />}
            </button>
          </span>
        );
      })}
      </div>
      <div className="shelf-tools">
        {desktop && (
          <div className="layouts-wrap">
            <button className="tool" aria-expanded={layoutsOpen} data-testid="layout-btn" onClick={() => setLayoutsOpen((o) => !o)}>
              <Glyph name="layout" size={15} />{S.layout}
            </button>
            {layoutsOpen && (
              <ul className="layouts-menu" data-testid="layouts-menu">
                {LAYOUTS.map((l) => (
                  <li key={l.id}>
                    <button data-testid={`layout-${l.id}`} onClick={() => { store.getState().layout(l.id); setLayoutsOpen(false); }}>{l.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button className="tool" data-testid="focus-btn" onClick={() => store.getState().toggleFocusMode()}>
          <Glyph name="focus" size={15} />{S.focus}<kbd>{S.ctrlDot}</kbd>
        </button>
        <div className="ws" role="group" aria-label={S.workspaces} data-testid="ws-switcher">
          {Array.from({ length: workspacesFor(rank) }, (_, i) => (i + 1) as 1 | 2 | 3).map((n) => (
            <button key={n} className={n === ws ? "on" : ""} aria-pressed={n === ws} aria-label={`${S.workspace} ${n}`} data-testid={`ws-${n}`} onClick={() => store.getState().setWorkspace(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

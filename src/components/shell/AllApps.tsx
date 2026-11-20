"use client";
// All apps: every group side by side in one panel, readable without scrolling at 1366 x 768. Opening an app is the only
// thing it does.
import { useEffect, useSyncExternalStore } from "react";
import { APP_IDS, APPS, GROUPS } from "@/shell/registry";
import { isBuiltApp } from "@/shell/appModules";
import { isShrouded } from "@/shell/v1Shroud";
import { APP_NAMES, GROUP_LABELS } from "@/shell/strings";
import { actLine } from "@/shell/simSession";
import { Glyph } from "./Glyph";
import { useShell, useShellStore } from "./ShellContext";

let open = false;
const subs = new Set<() => void>();
export function setAllApps(v: boolean): void {
  if (open === v) return;
  open = v;
  subs.forEach((f) => f());
}
export function useAllAppsOpen(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => open, () => false);
}

/** Opens the Help panel: what each part of the game is for, with a button to each app. */
export function openHelp(): void {
  setAllApps(false);
  void actLine("help");
}

const BLURB: Partial<Record<string, string>> = {
  broker: "Buy and sell", portfolio: "What you own", wire: "The papers", messages: "Letters", markets: "Every price",
  launchpad: "New coins", risk: "Margin and loans", research: "Firms read closely", businesses: "Firms you run",
  company: "Your company", property: "Homes", city: "The districts", bank: "Savings and loans", funds: "Pooled money",
  insurance: "Cover", institutions: "The big players", legal: "Courts", estate: "What you leave", boards: "Rankings",
  profile: "You", people: "Who you know", diary: "Your days", health: "Body and mind", civic: "The council",
  society: "Who is who", academy: "Courses", careers: "Work", citylife: "Evenings out", settings: "Settings", ailab: "The lab",
  security: "Locks and guards",
};

export function AllApps() {
  const isOpen = useAllAppsOpen();
  const store = useShellStore();
  const vis = useShell((s) => s.vis);
  const flags = useShell((s) => s.channels.me.flags);
  useEffect(() => {
    if (!isOpen) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setAllApps(false); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [isOpen]);
  if (!isOpen) return null;
  const groups = GROUPS.map((g) => ({
    g,
    apps: APP_IDS.filter((a) => APPS[a].group === g && isBuiltApp(a) && vis[a] !== "hidden" && !isShrouded(a, flags)),
  })).filter((x) => x.apps.length);
  return (
    <div className="scrim allapps-scrim" data-testid="allapps-scrim" onPointerDown={(e) => e.target === e.currentTarget && setAllApps(false)}>
      <div className="allapps" role="dialog" aria-modal="true" aria-label="All apps" data-testid="allapps">
        <header className="allapps-head">
          <h2>All apps</h2>
          <span className="allapps-tools">
            <button type="button" className="allapps-help" data-testid="allapps-help" onClick={openHelp}>
              <Glyph name="help" size={15} /> Help
            </button>
            <button type="button" className="goal-dismiss" onClick={() => setAllApps(false)}>Close</button>
          </span>
        </header>
        <div className="allapps-cols" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
          {groups.map(({ g, apps }) => (
            <section key={g} className="allapps-col">
              <p className="label">{GROUP_LABELS[g]}</p>
              {apps.map((a) => {
                const locked = vis[a] === "locked";
                return (
                  <button
                    key={a}
                    type="button"
                    className="allapps-app"
                    data-testid={`allapps-${a}`}
                    data-locked={locked ? "1" : "0"}
                    disabled={locked}
                    title={locked ? APPS[a].lockHint : APP_NAMES[a]}
                    onClick={() => { setAllApps(false); store.getState().open(a); }}
                  >
                    <Glyph name={a} size={18} />
                    <span>
                      <b>{APP_NAMES[a]}</b>
                      <small>{locked ? APPS[a].lockHint ?? "Not yet" : BLURB[a] ?? ""}</small>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// Launcher search (17 §3.2.5, SH-04). Commands only navigate or open pre-filled screens: no intents.
import { APP_IDS, type AppId } from "./registry";
import { APP_NAMES, LAUNCHER_GROUPS } from "./strings";
import type { Visibility } from "./unlock";

export type LauncherGroup = (typeof LAUNCHER_GROUPS)[number];
export interface LauncherItem { id: string; group: LauncherGroup; label: string; app: AppId; context?: string }

const TICKERS = [
  { t: "HALC", n: "Halcyon Systems" }, { t: "NRON", n: "Neuron Silicon" }, { t: "AVBK", n: "Bank of Port Avalon" },
];
const COMMANDS: { label: string; app: AppId }[] = [
  { label: "Open Settings", app: "settings" }, { label: "Go to Portfolio", app: "portfolio" }, { label: "Go to Wire", app: "wire" },
];
const HELP = [{ label: "How the tick works", app: "help" as const }];

export function search(query: string, vis: Record<AppId, Visibility>, recent: readonly AppId[]): LauncherItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return recent.slice(0, 6).map((app) => ({ id: `recent:${app}`, group: "Recent", label: APP_NAMES[app], app }));
  const hit = (s: string) => s.toLowerCase().includes(q);
  const apps: LauncherItem[] = APP_IDS.filter((id) => vis[id] === "unlocked" && hit(APP_NAMES[id]))
    .map((id) => ({ id: `app:${id}`, group: "Apps", label: APP_NAMES[id], app: id }));
  const tickers: LauncherItem[] = TICKERS.filter((x) => hit(x.t) || hit(x.n))
    .map((x) => ({ id: `tk:${x.t}`, group: "Tickers", label: `${x.t} · ${x.n}`, app: "broker", context: x.t }));
  const cmds: LauncherItem[] = COMMANDS.filter((c) => hit(c.label)).map((c) => ({ id: `cmd:${c.label}`, group: "Commands", ...c }));
  const rec: LauncherItem[] = recent.filter((a) => hit(APP_NAMES[a])).slice(0, 6)
    .map((app) => ({ id: `recent:${app}`, group: "Recent", label: APP_NAMES[app], app }));
  const help: LauncherItem[] = HELP.filter((h) => hit(h.label)).map((h) => ({ id: `help:${h.label}`, group: "Help", ...h }));
  return [...apps, ...tickers, ...cmds, ...rec, ...help];
}

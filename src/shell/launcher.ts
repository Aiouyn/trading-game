// Launcher search (17 §3.2.5, SH-04). Commands only navigate or open pre-filled screens: no intents.
import { isBuiltApp } from "./appModules";
import { APP_IDS, type AppId } from "./registry";
import { APP_NAMES, LAUNCHER_GROUPS } from "./strings";
import type { Visibility } from "./unlock";

export type LauncherGroup = (typeof LAUNCHER_GROUPS)[number];
export interface LauncherItem {
  id: string;
  group: LauncherGroup;
  label: string;
  app?: AppId;
  context?: string;
  /** A text-game line. Enter runs it instead of opening an app. */
  command?: string;
  detail?: string;
}

export interface SearchDir {
  tickers: { symbol: string; name: string }[];
  people: { name: string; word?: string; line?: string }[];
  firms: { id: string; name: string; symbol?: string }[];
}

const TICKERS = [
  { t: "HALC", n: "Halcyon Systems" }, { t: "NRON", n: "Neuron Silicon" }, { t: "AVBK", n: "Bank of Port Avalon" },
];
const COMMANDS: { label: string; app: AppId }[] = [
  { label: "Open Settings", app: "settings" }, { label: "Go to Portfolio", app: "portfolio" }, { label: "Go to Wire", app: "wire" },
];
const HELP = [{ label: "How the tick works", app: "help" as const }];
const VERBS = new Set([
  "help", "sheet", "story", "chronicle", "buy", "sell", "short", "cancel", "bond", "fut", "coin", "launch",
  "deposit", "withdraw", "borrow", "repay", "talk", "ask", "news", "why", "holiday", "donate", "lawyer",
  "clinic", "overtime", "wait", "found", "ceo", "ipo", "bid", "board", "court", "marry", "child", "school",
  "will", "retire", "hand", "die", "opt", "call", "put", "write", "close", "homes", "let", "move", "mortgage",
  "tip", "report", "hints", "desk", "quote",
  "mail", "reply", "lend", "invite", "gift", "introduce",
]);

export function prefersCommand(query: string): boolean {
  const head = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return VERBS.has(head);
}

export function search(query: string, vis: Record<AppId, Visibility>, recent: readonly AppId[], dir?: SearchDir): LauncherItem[] {
  const raw = query.trim();
  const q = raw.toLowerCase();
  const shown = (id: AppId) => isBuiltApp(id) && vis[id] !== "hidden";
  if (!q) return recent.filter(shown).slice(0, 6).map((app) => ({ id: `recent:${app}`, group: "Recent" as const, label: APP_NAMES[app], app }));
  const hit = (s: string) => s.toLowerCase().includes(q);
  const apps: LauncherItem[] = APP_IDS.filter((id) => isBuiltApp(id) && vis[id] === "unlocked" && hit(APP_NAMES[id]))
    .map((id) => ({ id: `app:${id}`, group: "Apps" as const, label: APP_NAMES[id], app: id }));
  const tickers: LauncherItem[] = (dir
    ? dir.tickers.filter((x) => hit(x.symbol) || hit(x.name)).slice(0, 8)
    : TICKERS.filter((x) => hit(x.t) || hit(x.n)).map((x) => ({ symbol: x.t, name: x.n }))
  ).map((x) => ({ id: `tk:${x.symbol}`, group: "Tickers" as const, label: `${x.symbol} · ${x.name}`, app: "broker" as const, context: x.symbol }));
  const people: LauncherItem[] = (dir?.people ?? []).filter((p) => p.name && (hit(p.name) || hit(p.word ?? "") || hit(p.line ?? ""))).slice(0, 8)
    .map((p, i) => ({
      id: `person:${i}:${p.name}`,
      group: "Players and companies" as const,
      label: p.name,
      detail: [p.word, p.line].filter(Boolean).join(". "),
    }));
  const firms: LauncherItem[] = (dir?.firms ?? []).filter((f) => hit(f.name) || hit(f.id) || hit(f.symbol ?? "")).slice(0, 8)
    .map((f) => {
      const listed = !!f.symbol && vis.broker === "unlocked";
      const company = !listed && vis.company === "unlocked";
      return {
        id: `firm:${f.id}`,
        group: "Players and companies" as const,
        label: f.name,
        app: listed ? "broker" as const : company ? "company" as const : undefined,
        context: listed ? f.symbol : f.id,
        detail: f.name,
      };
    });
  const run: LauncherItem[] = [{ id: "run", group: "Commands", label: raw, command: raw }];
  const cmds: LauncherItem[] = COMMANDS.filter((c) => hit(c.label)).map((c) => ({ id: `cmd:${c.label}`, group: "Commands" as const, label: c.label, app: c.app }));
  const rec: LauncherItem[] = recent.filter((a) => shown(a) && hit(APP_NAMES[a])).slice(0, 6)
    .map((app) => ({ id: `recent:${app}`, group: "Recent" as const, label: APP_NAMES[app], app }));
  const help: LauncherItem[] = HELP.filter((h) => isBuiltApp(h.app) && hit(h.label)).map((h) => ({ id: `help:${h.label}`, group: "Help" as const, label: h.label, app: h.app }));
  return [...apps, ...tickers, ...people, ...firms, ...run, ...cmds, ...rec, ...help];
}

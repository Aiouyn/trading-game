// The one list of apps with a real body (QA #71 follow-up). An app is built exactly when it has an entry here: the
// registry derives `built` from these keys and AppBody renders from the same record, so "built, but no body" cannot be
// written down. Each entry names its lazy module, so an id without a real app module fails to compile.
// No React at runtime: the import thunks run only when AppBody first opens the app.
import type { ComponentType } from "react";
import type { AppId } from "./registry";

/** What every app body receives: the window's context (Broker: the assetId; Portfolio: "Journal"), when it has one. */
export interface AppBodyProps { context?: string }
/** Its own chunk, loaded on first open (17B CH-00: keeps the first-load JS in budget, G4). */
interface LazyBody { kind: "lazy"; load: () => Promise<{ default: ComponentType<AppBodyProps> }> }

export const APP_MODULES = {
  settings: { kind: "lazy", load: () => import("@/apps/settings/SettingsApp").then((m) => ({ default: m.SettingsApp })) },
  broker: { kind: "lazy", load: () => import("@/apps/broker/App") }, // UI card 4 (BRK-A)
  portfolio: { kind: "lazy", load: () => import("@/apps/portfolio/App") },
  wire: { kind: "lazy", load: () => import("@/apps/wire/App") },
  boards: { kind: "lazy", load: () => import("@/apps/boards/App") }, // M2-03 net-worth leaderboard
  city: { kind: "lazy", load: () => import("@/apps/city/DistrictView") },
  launchpad: { kind: "lazy", load: () => import("@/apps/launchpad/App") }, // owner-restored meme-coin Launchpad (first loop) // M1-10 static read-only district view
} as const satisfies Partial<Record<AppId, LazyBody>>;

type Modules = typeof APP_MODULES;
export type BuiltAppId = keyof Modules;

export function isBuiltApp(id: AppId): id is BuiltAppId {
  return Object.hasOwn(APP_MODULES, id);
}

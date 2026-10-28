// The one list of apps with a real body (QA #71 follow-up). An app is built exactly when it has an entry here: the
// registry derives `built` from these keys and AppBody renders from the same record, so "built, but no body" cannot be
// written down. A lazy entry names its module, so an id without a real app module fails to compile; an eager entry
// must be matched by a component in AppBody's EAGER_BODIES (typed exhaustive), so it cannot be a bare id either.
// No React at runtime: the import thunks run only when AppBody first opens the app.
import type { ComponentType } from "react";
import type { AppId } from "./registry";

/** What every app body receives: the window's context (Broker: the assetId; Portfolio: "Journal"), when it has one. */
export interface AppBodyProps { context?: string }
/** Its own chunk, loaded on first open (17B CH-00: keeps the first-load JS in budget, G4). */
interface LazyBody { kind: "lazy"; load: () => Promise<{ default: ComponentType<AppBodyProps> }> }
/** Statically imported by AppBody, which must give every eager id a component. */
interface EagerBody { kind: "eager" }

export const APP_MODULES = {
  settings: { kind: "eager" },
  broker: { kind: "lazy", load: () => import("@/apps/broker/App") }, // UI card 4 (BRK-A)
  portfolio: { kind: "lazy", load: () => import("@/apps/portfolio/App") },
  wire: { kind: "lazy", load: () => import("@/apps/wire/App") },
} as const satisfies Partial<Record<AppId, LazyBody | EagerBody>>;

type Modules = typeof APP_MODULES;
export type BuiltAppId = keyof Modules;
export type LazyAppId = { [K in BuiltAppId]: Modules[K] extends LazyBody ? K : never }[BuiltAppId];
export type EagerAppId = Exclude<BuiltAppId, LazyAppId>;

export function isBuiltApp(id: AppId): id is BuiltAppId {
  return Object.hasOwn(APP_MODULES, id);
}

export function isLazyApp(id: BuiltAppId): id is LazyAppId {
  return APP_MODULES[id].kind === "lazy";
}

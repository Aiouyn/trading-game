"use client";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactElement } from "react";
import { WireLoading } from "@/apps/wire/Skeleton";
import { APP_MODULES, isBuiltApp, type AppBodyProps, type BuiltAppId } from "@/shell/appModules";
import type { AppId } from "@/shell/registry";
import { AppSkeleton } from "./AppSkeleton";
import { ComingLater } from "./ComingLater";
import { LockTile } from "./LockTile";
import { useShell } from "./ShellContext";

/** focused window; collapsed; background = other workspace or covered in compact; hidden = not displayed at all. */
export interface BodyState { focused: boolean; collapsed: boolean; background: boolean; hidden?: boolean }

// Bodies come from APP_MODULES, the same record the registry derives `built` from (QA #71 follow-up): an app renders a
// body here exactly when it is built, and every built app has one. Each lazy app is its own chunk (17B CH-00, G4).
const LAZY_BODIES = {} as Record<BuiltAppId, LazyExoticComponent<ComponentType<AppBodyProps>>>;
for (const id of Object.keys(APP_MODULES) as BuiltAppId[]) LAZY_BODIES[id] = lazy(APP_MODULES[id].load);
/** App-specific chunk-loading skeletons, when an app's first paint has its own shape. Everything else: AppSkeleton. */
const APP_SKELETONS: Partial<Record<BuiltAppId, ReactElement>> = { wire: <WireLoading /> };

/** `context` is the window's (or phone app's) context: Broker reads it as the assetId (UI card 4). */
export function AppBody({ app, context }: { app: AppId; state: BodyState; context?: string }) {
  const vis = useShell((s) => s.vis[app]);
  if (vis !== "unlocked") return <LockTile app={app} />;
  if (!isBuiltApp(app)) return <ComingLater app={app} />; // built:false: no chunk, no fallback
  const Body = LAZY_BODIES[app];
  // Studio Q3: while a built app's chunk loads, the window shows a skeleton, never "Coming later" (that is only for
  // built:false apps). The generic AppSkeleton is the default; Wire keeps its own, which is its first paint.
  return <Suspense fallback={APP_SKELETONS[app] ?? <AppSkeleton app={app} />}><Body context={context} /></Suspense>;
}

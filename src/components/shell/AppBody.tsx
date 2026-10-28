"use client";
import { lazy, Suspense, type ReactElement } from "react";
import { CityWindow } from "@/apps/city/CityWindow";
import { SettingsApp } from "@/apps/settings/SettingsApp";
import { WireLoading } from "@/apps/wire/Skeleton";
import type { AppId } from "@/shell/registry";
import { AppSkeleton } from "./AppSkeleton";
import { ComingLater } from "./ComingLater";
import { LockTile } from "./LockTile";
import { useShell } from "./ShellContext";

/** focused window; collapsed; background = other workspace or covered in compact; hidden = not displayed at all. */
export interface BodyState { focused: boolean; collapsed: boolean; background: boolean; hidden?: boolean }

// 17B CH-00: each built 17B app is its own chunk, loaded on first open (keeps the first-load JS in budget, G4).
// Broker is built:false until BRK-A, so it renders ComingLater directly below, with no chunk and no loading fallback.
const BUILT_APPS = {
  portfolio: lazy(() => import("@/apps/portfolio/App")),
  wire: lazy(() => import("@/apps/wire/App")),
} as const;
const isBuiltApp = (a: AppId): a is keyof typeof BUILT_APPS => a in BUILT_APPS;
/** App-specific chunk-loading skeletons, when an app's first paint has its own shape. Everything else: AppSkeleton. */
const APP_SKELETONS: Partial<Record<keyof typeof BUILT_APPS, ReactElement>> = { wire: <WireLoading /> };

export function AppBody({ app, state }: { app: AppId; state: BodyState }) {
  const vis = useShell((s) => s.vis[app]);
  if (vis !== "unlocked") return <LockTile app={app} />;
  if (app === "settings") return <SettingsApp />;
  if (app === "city") return <CityWindow state={state} />;
  if (isBuiltApp(app)) {
    const Body = BUILT_APPS[app];
    // Studio Q3: while a built app's chunk loads, the window shows a skeleton, never "Coming later" (that is only for
    // built:false apps below). The generic AppSkeleton is the default; Wire keeps its own, which is its first paint.
    const fallback = app in APP_SKELETONS ? APP_SKELETONS[app as keyof typeof APP_SKELETONS] : <AppSkeleton app={app} />;
    return <Suspense fallback={fallback}><Body /></Suspense>;
  }
  // Every other app is built:false in Spec 1.
  return <ComingLater app={app} />;
}

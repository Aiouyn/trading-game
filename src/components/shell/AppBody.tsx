"use client";
import { lazy, Suspense } from "react";
import { CityWindow } from "@/apps/city/CityWindow";
import { SettingsApp } from "@/apps/settings/SettingsApp";
import type { AppId } from "@/shell/registry";
import { ComingLater } from "./ComingLater";
import { LockTile } from "./LockTile";
import { useShell } from "./ShellContext";

/** focused window; collapsed; background = other workspace or covered in compact; hidden = not displayed at all. */
export interface BodyState { focused: boolean; collapsed: boolean; background: boolean; hidden?: boolean }

// 17B CH-00: each 17B app is its own chunk, loaded on first open (keeps Broker first-load JS in budget, G4).
const BUILT_APPS = {
  broker: lazy(() => import("@/apps/broker/App")),
  portfolio: lazy(() => import("@/apps/portfolio/App")),
  wire: lazy(() => import("@/apps/wire/App")),
} as const;
const isBuiltApp = (a: AppId): a is keyof typeof BUILT_APPS => a in BUILT_APPS;

export function AppBody({ app, state }: { app: AppId; state: BodyState }) {
  const vis = useShell((s) => s.vis[app]);
  if (vis !== "unlocked") return <LockTile app={app} />;
  if (app === "settings") return <SettingsApp />;
  if (app === "city") return <CityWindow state={state} />;
  if (isBuiltApp(app)) {
    const Body = BUILT_APPS[app];
    // Fallback = the placeholder the chunk renders today, so loading the chunk never changes the DOM (S1-03).
    return <Suspense fallback={<ComingLater app={app} />}><Body /></Suspense>;
  }
  // Every other app is built:false in Spec 1.
  return <ComingLater app={app} />;
}

"use client";
import { lazy, Suspense } from "react";
import { CityWindow } from "@/apps/city/CityWindow";
import { SettingsApp } from "@/apps/settings/SettingsApp";
import { WireLoading } from "@/apps/wire/Skeleton";
import type { AppId } from "@/shell/registry";
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

export function AppBody({ app, state }: { app: AppId; state: BodyState }) {
  const vis = useShell((s) => s.vis[app]);
  if (vis !== "unlocked") return <LockTile app={app} />;
  if (app === "settings") return <SettingsApp />;
  if (app === "city") return <CityWindow state={state} />;
  if (isBuiltApp(app)) {
    const Body = BUILT_APPS[app];
    // Fallback = what the chunk shows first: Wire's loading skeleton (Studio: a built app never flashes "Coming later");
    // Portfolio still renders the ComingLater placeholder, so loading its chunk never changes the DOM (S1-03).
    const fallback = app === "wire" ? <WireLoading /> : <ComingLater app={app} />;
    return <Suspense fallback={fallback}><Body /></Suspense>;
  }
  // Every other app (Broker included, until BRK-A) is built:false.
  return <ComingLater app={app} />;
}

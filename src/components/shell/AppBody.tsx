"use client";
import { CityWindow } from "@/apps/city/CityWindow";
import { SettingsApp } from "@/apps/settings/SettingsApp";
import type { AppId } from "@/shell/registry";
import { ComingLater } from "./ComingLater";
import { LockTile } from "./LockTile";
import { useShell } from "./ShellContext";

/** focused window; collapsed; background = other workspace or covered in compact; hidden = not displayed at all. */
export interface BodyState { focused: boolean; collapsed: boolean; background: boolean; hidden?: boolean }

export function AppBody({ app, state }: { app: AppId; state: BodyState }) {
  const vis = useShell((s) => s.vis[app]);
  if (vis !== "unlocked") return <LockTile app={app} />;
  if (app === "settings") return <SettingsApp />;
  if (app === "city") return <CityWindow state={state} />;
  // Every other app is built:false in Spec 1.
  return <ComingLater app={app} />;
}

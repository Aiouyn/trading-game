"use client";
import { type ReactElement } from "react";
import { WireLoading, wireBootLabel } from "@/apps/wire/Skeleton";
import { retryableLazy, scopedModuleProps } from "@/components/shell/retryableLazy";
import { APP_MODULES, isBuiltApp, isLazyApp, type AppBodyProps, type BuiltAppId, type LazyAppId } from "@/shell/appModules";
import type { AppId } from "@/shell/registry";
import { S } from "@/shell/strings";
import { AppSkeleton } from "./AppSkeleton";
import { ComingLater } from "./ComingLater";
import { LockTile } from "./LockTile";
import { useShell } from "./ShellContext";

/** focused window; collapsed; background = other workspace or covered in compact; hidden = not displayed at all. */
export interface BodyState { focused: boolean; collapsed: boolean; background: boolean; hidden?: boolean }

// Bodies come from APP_MODULES, the same record the registry derives `built` from (QA #71 follow-up): an app renders a
// body here exactly when it is built, and every built app has one. Each lazy app is its own chunk (17B CH-00, G4),
// wrapped in a retry boundary so a failed import remounts a new lazy() generation instead of crashing the window.
const LAZY_BODIES = {} as Record<LazyAppId, ReturnType<typeof retryableLazy<AppBodyProps>>>;
for (const id of Object.keys(APP_MODULES) as BuiltAppId[]) {
  // Card 5: Settings also hands focus to Retry and back to the recovered form (its whole body is one chunk).
  if (isLazyApp(id)) LAZY_BODIES[id] = retryableLazy(APP_MODULES[id].load, id === "settings" ? { focus: true } : undefined);
}

function WireBootFallback() {
  const locale = useShell((s) => s.prefs.locale);
  return <WireLoading label={wireBootLabel(locale)} />;
}

/** App-specific chunk-loading skeletons, when an app's first paint has its own shape. Everything else: AppSkeleton. */
function skeletonOf(app: LazyAppId): ReactElement {
  if (app === "wire") return <WireBootFallback />;
  return <AppSkeleton app={app} />;
}

/** `context` is the window's (or phone app's) context: Broker reads it as the assetId (UI card 4). */
export function AppBody({ app, context }: { app: AppId; state: BodyState; context?: string }) {
  const vis = useShell((s) => s.vis[app]);
  const locale = useShell((s) => s.prefs.locale);
  if (vis !== "unlocked") return <LockTile app={app} />;
  if (!isBuiltApp(app)) return <ComingLater app={app} />; // built:false: no chunk, no fallback
  if (!isLazyApp(app)) {
    const _exhaustive: never = app;
    return _exhaustive;
  }
  const Body = LAZY_BODIES[app];
  // Studio Q3: while a built app's chunk loads, the window shows a skeleton, never "Coming later" (that is only for
  // built:false apps). The generic AppSkeleton is the default; Wire keeps its own, which is its first paint.
  // Card 5: Settings says which module failed, in the player's locale (en/fr).
  const copy = app === "settings"
    ? scopedModuleProps("settings", locale)
    : { errorMessage: app === "city" ? S.cityCouldntLoad : S.couldntLoad, retryLabel: S.retry, errorTestId: `${app}-chunk-error` };
  return <Body context={context} fallback={skeletonOf(app)} retryTestId={`${app}-chunk-retry`} {...copy} />;
}

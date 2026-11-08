"use client";
// M2-02 slot that Broker hosts on desktop: the goal module owns its own gating (signed-in account, no Portfolio window
// on this workspace), so Broker reads no account state. The entry itself is in the guide's lazy chunk, loaded only
// for a signed-in player; guests and the Broker route's first load never fetch it.
import { lazy, Suspense } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { isSignedIn, useAuthChrome } from "@/shell/authChrome";

const GoalEntry = lazy(() => import("./GoalGuide").then((m) => ({ default: m.GoalEntry })));

export function GoalSlot({ locale }: { locale: string }) {
  const auth = useAuthChrome();
  // Desktop 1024–1263 opens Broker alone (layouts.ts, TRADE_MIN_VW); at 1440 Portfolio already shows the goal.
  const pfShown = useShell((s) => s.local.windows.some((w) => w.app === "portfolio" && w.workspace === s.local.activeWorkspace && !w.collapsed));
  if (pfShown || !isSignedIn(auth)) return null;
  return <Suspense fallback={null}><GoalEntry accountId={auth.account.accountId} locale={locale} /></Suspense>;
}

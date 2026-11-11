"use client";
// M2-02 slot that Broker hosts on desktop: the goal module owns its own gating (signed-in account, no Portfolio window
// on this workspace), so Broker reads no account state. The entry itself is in the guide's lazy chunk, loaded only
// for a signed-in player; guests and the Broker route's first load never fetch it.
import { asDefault, retryableLazy } from "@/components/shell/retryableLazy";
import { useShell } from "@/components/shell/ShellContext";
import { isSignedIn, useAuthChrome } from "@/shell/authChrome";
import { S } from "@/shell/strings";
import "./goalSlot.css";

const RetryableGoalEntry = retryableLazy(async () => asDefault((await import("./GoalGuide")).GoalEntry));

export function GoalSlot({ locale }: { locale: string }) {
  const auth = useAuthChrome();
  // Desktop 1024–1263 opens Broker alone (layouts.ts, TRADE_MIN_VW); at 1440 Portfolio already shows the goal.
  const pfShown = useShell((s) => s.local.windows.some((w) => w.app === "portfolio" && w.workspace === s.local.activeWorkspace && !w.collapsed));
  if (pfShown || !isSignedIn(auth)) return null;
  return (
    <RetryableGoalEntry
      accountId={auth.account.accountId}
      locale={locale}
      fallback={<div className="pf-goal-skel" data-testid="pf-goal-loading" aria-busy="true" role="status" />}
      errorMessage={S.couldntLoad}
      retryLabel={S.retry}
      errorTestId="pf-goal-error"
      retryTestId="pf-goal-retry"
    />
  );
}

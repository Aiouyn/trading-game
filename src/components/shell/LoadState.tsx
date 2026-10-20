"use client";
// §5 error / offline state: inline "Couldn't load · Retry" or "Offline · read-only snapshot · Retry".
// [P] Visual not specified by Studio: reuses the banner layer (z 110), --win2 / --line / --fg-muted tokens.
import { retryLoad } from "@/shell/loader";
import { S } from "@/shell/strings";
import { useShell } from "./ShellContext";

export function LoadState() {
  const sys = useShell((s) => s.channels.system);
  if (sys.load === "ok" && !sys.offline) return null;
  const loading = sys.load === "loading";
  return (
    <div className="load-state" role="alert" data-testid={sys.offline ? "offline-state" : "load-error"}>
      <span>{sys.offline ? S.offline : S.couldntLoad}</span>
      <span aria-hidden="true">{" · "}</span>
      <button className="load-retry" data-testid="load-retry" onClick={retryLoad} disabled={loading}>{loading ? S.retrying : S.retry}</button>
    </div>
  );
}

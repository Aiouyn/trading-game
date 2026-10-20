"use client";
// §5 error / offline state. Desktop: inline pill under the strip (Studio-approved).
// Phone: full-width 32 px banner in the flow directly under the status bar; it pushes content down
// and never overlaps it. Height eases over --dur-fast (0 under reduced motion).
import { retryLoad } from "@/shell/loader";
import { S } from "@/shell/strings";
import { useShell } from "./ShellContext";

export function LoadState({ variant = "pill" }: { variant?: "pill" | "banner" }) {
  const sys = useShell((s) => s.channels.system);
  const open = sys.load !== "ok" || sys.offline;
  const loading = sys.load === "loading";
  const body = open && (
    <div className="load-state-body" role="alert" data-testid={sys.offline ? "offline-state" : "load-error"}>
      <span>{sys.offline ? S.offline : S.couldntLoad}</span>
      <span aria-hidden="true">{" · "}</span>
      {/* The hidden pseudo-label reserves the width of the other label, so tapping never re-wraps the banner. */}
      <button className="load-retry" data-testid="load-retry" data-alt={loading ? S.retry : S.retrying} onClick={retryLoad} disabled={loading}>
        <span className="load-retry-label">{loading ? S.retrying : S.retry}</span>
      </button>
    </div>
  );
  if (variant === "banner") {
    return <div className="phone-banner" data-testid="phone-banner" data-open={open}>{body}</div>;
  }
  return open ? <div className="load-state">{body}</div> : null;
}

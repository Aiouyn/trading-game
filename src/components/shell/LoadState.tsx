"use client";
// §5 error / offline state. Desktop: inline pill under the strip (Studio-approved).
// Phone: full-width 32 px banner in the flow directly under the status bar; it pushes content down
// and never overlaps it. Height eases over --dur-fast (0 under reduced motion).
import { retryLoad } from "@/shell/loader";
import { S } from "@/shell/strings";
import { MoreButton } from "./Banner";
import { useShell } from "./ShellContext";

export function LoadState({ variant = "pill", extra = 0, onMore }: { variant?: "pill" | "banner"; extra?: number; onMore?: () => void }) {
  const sys = useShell((s) => s.channels.system);
  const open = sys.load !== "ok" || sys.offline;
  const loading = sys.load === "loading";
  const body = open && (
    <div className="load-state-body" data-testid={sys.offline ? "offline-state" : "load-error"}>
      {/* Only the message is in the live region; Retry's label changes are never re-announced. */}
      <span role="alert" data-testid="load-message">{sys.offline ? S.offline : S.couldntLoad}</span>
      <span aria-hidden="true">{" · "}</span>
      {/* The hidden pseudo-label reserves the width of the other label, so tapping never re-wraps the banner. */}
      <button className="load-retry" data-testid="load-retry" data-alt={loading ? S.retry : S.retrying}
        // aria-disabled (not disabled) so Retry keeps focus while pending; activation is ignored meanwhile.
        aria-disabled={loading} onClick={() => { if (!loading) retryLoad(); }}>
        <span className="load-retry-label">{loading ? S.retrying : S.retry}</span>
      </button>
      {extra > 0 && <MoreButton n={extra} onMore={onMore} />}
    </div>
  );
  if (variant === "banner") {
    return <div className="phone-banner" data-testid="phone-banner" data-open={open}>{body}</div>;
  }
  return open ? <div className="load-state">{body}</div> : null;
}

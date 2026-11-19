"use client";
// New launches, seen from anywhere: the count on the Launchpad's dock icon. A launch counts once the Launchpad is shut and
// the coin is not the player's own; opening the Launchpad clears the count. Per session, read from the sim's view only.
import { useEffect, useSyncExternalStore } from "react";
import { useSimSnap } from "@/shell/simSession";
import { coinsOf, type Coin } from "./model";

let seen = -1;
let primed = false;
let open = false;
let count = 0;
let top = -1; // the newest coin launch the last board read showed
const ears = new Set<() => void>();

function publish(next: number) {
  if (next === count) return;
  count = next;
  for (const fn of ears) fn();
}
function subscribe(fn: () => void) {
  ears.add(fn);
  return () => { ears.delete(fn); };
}

/** The Launchpad is on screen (true) or shut (false). Opening it clears the count. */
export function setLaunchpadOpen(on: boolean) {
  open = on;
  // Everything shown while it was open is seen, so shutting it does not count those launches.
  seen = Math.max(seen, top);
  if (on) publish(0);
}

/** Count the launches the player has not seen, from the sim's coin board. The first read only sets the baseline. */
export function ingestLaunches(coins: readonly Coin[]) {
  top = -1;
  for (const c of coins) if (c.eventId > top) top = c.eventId;
  if (!primed) {
    primed = true;
    seen = top;
    publish(0);
    return;
  }
  if (open) {
    seen = Math.max(seen, top);
    publish(0);
    return;
  }
  let n = 0;
  for (const c of coins) if (c.eventId > seen && !c.mine) n++;
  publish(n);
}

/** The count on the Launchpad icon in the dock. */
export function LaunchBadge() {
  const { view } = useSimSnap();
  const n = useSyncExternalStore(subscribe, () => count, () => 0);
  useEffect(() => { ingestLaunches(coinsOf(view)); }, [view]);
  if (n < 1) return null;
  return <span className="dock-badge" data-testid="launchpad-badge">{n > 9 ? "9+" : n}</span>;
}

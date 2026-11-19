"use client";
// The Launchpad's live read. One request returns every coin as its pool stands that minute, the tape, the player's tokens,
// recent rugs and, while a coin page is open, that coin's holders, trades and posts. It is asked again every second or so
// whatever speed the clock runs at, so new launches, prices, caps and the king of the hill move without reopening.
import { useCallback, useEffect, useRef, useState } from "react";
import { readLp, type LpData } from "./model";

const FAST_MS = 1_000;
const HIDDEN_MS = 4_000;

export interface LpRead {
  data: LpData | null;
  /** True once reads have failed for a few seconds: what is on screen is the last one that worked. */
  stale: boolean;
  /** Read again now (after a trade or a launch). */
  refresh: () => void;
}

/** Poll /coins while mounted. `coin` is the open coin page, if any. */
export function useLaunchpad(coin: string | null): LpRead {
  const [data, setData] = useState<LpData | null>(null);
  const [fails, setFails] = useState(0);
  const coinRef = useRef(coin);
  coinRef.current = coin;
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let busy = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctl: AbortController | null = null;
    const run = async () => {
      if (!alive) return;
      if (busy) { again = true; return; }
      busy = true;
      if (timer) { clearTimeout(timer); timer = null; }
      ctl = new AbortController();
      const asked = coinRef.current;
      try {
        const res = await fetch(`/api/sim/coins${asked ? `?coin=${encodeURIComponent(asked)}` : ""}`, { cache: "no-store", signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const next = readLp(await res.json());
        if (!next) throw new Error("shape");
        if (alive) { setData(next); setFails(0); }
      } catch {
        if (alive && !ctl.signal.aborted) setFails((n) => n + 1);
      } finally {
        busy = false;
        if (alive) {
          if (again) { again = false; void run(); }
          else timer = setTimeout(() => { void run(); }, typeof document !== "undefined" && document.hidden ? HIDDEN_MS : FAST_MS);
        }
      }
    };
    kick.current = () => { void run(); };
    void run();
    return () => { alive = false; if (timer) clearTimeout(timer); ctl?.abort(); };
  }, []);

  // A different coin page asks at once rather than at the next beat.
  useEffect(() => { kick.current(); }, [coin]);
  const refresh = useCallback(() => { kick.current(); }, []);
  return { data, stale: fails >= 4, refresh };
}

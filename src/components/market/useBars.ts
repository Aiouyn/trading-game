"use client";
// Candles for one instrument at one timeframe, kept live. The minute bars are fetched once (six game days) and then only
// the newest few are asked for as the game clock runs; every intraday size is cut from them here on the session clock.
// The daily sizes come from the sim's daily bars the same way. Nothing is priced here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cut, fetchRaw, isIntraday, merge, tfMinutes, type Bar, type Raw, type Series, type Tf } from "./terminalApi";

const FULL: Record<string, number> = { "1m": 9000, "1d": 3000, "1w": 1000, "1M": 300 };
const FRESH: Record<string, number> = { "1m": 90, "1d": 4, "1w": 3, "1M": 3 };
const KEEP: Record<string, number> = { "1m": 9000, "1d": 5000, "1w": 2000, "1M": 600 };
/** A minute store this far behind the clock is refetched whole (the clock ran while the page was hidden). */
const GAP_MIN = 80;

const apiOf = (tf: Tf): "1m" | "1d" | "1w" | "1M" => (isIntraday(tf) ? "1m" : tf === "1D" ? "1d" : tf === "1W" ? "1w" : "1M");

export interface Bars { series: Series | null; today: Bar | null; missing: boolean }

/** `stamp` changes whenever the game clock or a price moves; it is what drives the live refresh. */
export function useBars(instr: string | null, tf: Tf, stamp: string): Bars {
  const api = apiOf(tf);
  const key = instr ? `${instr}|${api}` : "";
  const store = useRef<{ key: string; raw: Raw | null; missing: boolean }>({ key: "", raw: null, missing: false });
  const [rev, setRev] = useState(0);
  const busy = useRef(false);
  const again = useRef(false);
  const keyNow = useRef(key);
  keyNow.current = key;

  const pull = useCallback(async () => {
    const k = keyNow.current;
    if (!k) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      const [id, a] = k.split("|") as [string, "1m" | "1d" | "1w" | "1M"];
      const st = store.current;
      const have = st.key === k && st.raw && st.raw.bars.length > 0;
      let full = !have;
      if (!full) {
        const got = await fetchRaw(id, a, FRESH[a]!);
        if (keyNow.current !== k) return;
        if (got && st.raw && (a !== "1m" || got.now - st.raw.now <= GAP_MIN)) {
          st.raw = { meta: got.meta, bars: merge(st.raw.bars, got.bars, KEEP[a]!), now: got.now };
          setRev((n) => n + 1);
        } else full = true;
      }
      if (full) {
        const got = await fetchRaw(id, a, FULL[a]!);
        if (keyNow.current !== k) return;
        store.current = { key: k, raw: got, missing: !got };
        setRev((n) => n + 1);
      }
    } finally {
      busy.current = false;
      if (again.current) { again.current = false; void pull(); }
    }
  }, []);

  // a new instrument or size starts from a full fetch
  useEffect(() => { if (store.current.key !== key) store.current = { key, raw: null, missing: false }; void pull(); }, [key, pull]);
  // then only the newest bars as the clock runs
  useEffect(() => { if (key) void pull(); }, [stamp, key, pull]);

  return useMemo<Bars>(() => {
    const st = store.current;
    if (!instr || st.key !== key || !st.raw) return { series: null, today: null, missing: !!instr && st.key === key && st.missing };
    const { meta, bars } = st.raw;
    const out = isIntraday(tf) ? cut(bars, tfMinutes(tf), meta.session) : bars;
    // today's candle: the day of the newest minute, or the newest daily bar
    let today: Bar | null = null;
    if (bars.length) {
      if (isIntraday(tf)) {
        const day = Math.floor(bars[bars.length - 1]!.ts / 86400);
        for (let i = bars.length - 1; i >= 0 && Math.floor(bars[i]!.ts / 86400) === day; i--) {
          const b = bars[i]!;
          today = today ? { ts: b.ts, o: b.o, h: Math.max(today.h, b.h), l: Math.min(today.l, b.l), c: today.c, v: today.v + b.v } : { ...b };
        }
      } else today = bars[bars.length - 1]!;
    }
    return { series: { ...meta, tf, bars: out }, today, missing: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, tf, key, instr]);
}

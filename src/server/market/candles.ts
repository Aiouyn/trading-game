// M1-07 server candle history: quote OHLC sampled from the one authoritative clock, volume from executed Broker fills.
//  - Price: every clock step samples each asset's server `last`. A bar opens at the previous bar's close (the quote moved
//    from there inside this span) and h/l/c follow the samples. The first bar after a process start opens at its first
//    sample. Nothing before the first sample exists: no back-filled or invented history.
//  - Volume: the sum of executed fill quantities (place takers and swept makers) at the fill's tick, each fillId counted
//    once, so a replayed idempotency key (no new fill) or a repeated notification never double counts. NPC quote motion
//    is not volume. Only public aggregates leave this module (no account, order or fill ids).
//  - Revisions: every change to a bar (a sample, or volume from a fill whose save may finish long after its bar closed)
//    bumps one counter and marks the bar. A reader passing the last revision it holds (`since`) also gets every bar
//    changed after it, however late (within the kept bars): no fixed re-read window. The counter belongs to this recorder
//    (`epoch`, new per process / clock), so a revision from another history is never compared with this one.
//  - Process-local, like the clock: a restart starts the history again (the chart says since when it has data).
import { ASSETS, ASSET_BY_ID } from "@/market/catalog";
import { parseMinor, type MarketSnapshot } from "@/market/quoteSnapshot";
import type { Candle, CandleHistoryReq, CandleRes } from "@/shell/contracts/channels";
import { fmt } from "@/shell/contracts/mockFeed";
import type { LiveMarket } from "./clock";

/** Ticks per bar (engine calendar: 30 ticks an hour, 720 a day), as the client's history.ts SPAN. */
export const CANDLE_SPAN: Readonly<Record<CandleRes, number>> = { tick: 1, hour: 30, day: 720 };
export const CANDLE_RES: readonly CandleRes[] = ["tick", "hour", "day"];
/** Bars kept per asset and resolution (the client's per-call cap). */
export const CANDLE_KEEP = 5000;
/** Fill ids remembered for de-duplication. Far above the fills one process makes between restarts in a playtest. */
export const FILL_IDS_KEEP = 200_000;

/** A bar in integer minor units (price) and whole units (volume). */
interface MinorBar { t: number; o: number; h: number; l: number; c: number; v: number; /** revision of its last volume change */ rv: number }

/** The public part of an executed fill that volume needs. */
export interface ExecutedFill { readonly fillId: string; readonly assetId: string; readonly tick: number; readonly qty: string }

export class CandleRecorder {
  private readonly bars = new Map<string, Record<CandleRes, MinorBar[]>>();
  private readonly seen = new Set<string>();
  private lastTick = -1;
  private rev = 0;
  /** Names this history: a restarted process (or swapped clock) starts a new one, with revisions from 0 again. */
  readonly epoch = Math.random().toString(36).slice(2, 10) || "0";

  /** Bumped once per sample and once per counted fill; each bar remembers the revision of its last change. */
  get revision(): number { return this.rev; }

  constructor() {
    for (const a of ASSETS) this.bars.set(a.assetId, { tick: [], hour: [], day: [] });
  }

  /** Record one clock snapshot. Same or older tick: ignored (a re-read is not a new sample), except `listed`: an asset
   *  listed at run time (L4) is sampled at its listing tick, so a fill on that tick has its bar; nothing else changes. */
  sample(snap: MarketSnapshot, listed = false): void {
    if (snap.tick < this.lastTick || (snap.tick === this.lastTick && !listed)) return;
    this.lastTick = snap.tick;
    this.rev += 1;
    for (const a of ASSETS) {
      if (listed && this.bars.get(a.assetId)?.tick.length) continue;
      const row = snap.quotes.rows[a.assetId];
      const px = row ? parseMinor(row.last, a.displayDecimals) : null;
      if (px === null || px <= 0) continue;
      // An asset listed at run time (L4) gets its bars from its first sample on: nothing before it is invented.
      let per = this.bars.get(a.assetId);
      if (!per) this.bars.set(a.assetId, (per = { tick: [], hour: [], day: [] }));
      for (const res of CANDLE_RES) {
        const list = per[res];
        const t = snap.tick - (snap.tick % CANDLE_SPAN[res]);
        const cur = list[list.length - 1];
        if (cur && cur.t === t) {
          cur.h = Math.max(cur.h, px); cur.l = Math.min(cur.l, px); cur.c = px; cur.rv = this.rev;
        } else {
          const o = cur ? cur.c : px;
          list.push({ t, o, h: Math.max(o, px), l: Math.min(o, px), c: px, v: 0, rv: this.rev });
          if (list.length > CANDLE_KEEP) list.splice(0, list.length - CANDLE_KEEP);
        }
      }
    }
  }

  /** Add executed fills to the volume of their bars. A fillId already counted, or a fill with no sampled bar, adds nothing. */
  recordFills(fills: readonly ExecutedFill[]): void {
    for (const f of fills) {
      if (this.seen.has(f.fillId)) continue;
      const per = this.bars.get(f.assetId);
      const qty = Number(f.qty);
      if (!per || !/^\d+$/.test(f.qty) || !Number.isSafeInteger(qty) || !Number.isSafeInteger(f.tick)) continue;
      // Only at a sampled tick, so every resolution agrees (a fill always lands on the clock's current, sampled tick).
      if (!findBar(per.tick, f.tick)) continue;
      this.seen.add(f.fillId);
      if (this.seen.size > FILL_IDS_KEEP) this.seen.delete(this.seen.values().next().value!);
      this.rev += 1;
      for (const res of CANDLE_RES) {
        const t = f.tick - (f.tick % CANDLE_SPAN[res]);
        const bar = findBar(per[res], t);
        if (bar) { bar.v += qty; bar.rv = this.rev; }
      }
    }
  }

  /** Bars with from (aligned down) <= t <= to, oldest first, at most CANDLE_KEEP. Unknown asset: none. With `since`, also
   *  every bar outside that range changed after that revision (older or newer; still oldest first). */
  history(req: CandleHistoryReq, since?: number): Candle[] {
    const a = ASSET_BY_ID[req.assetId];
    const per = this.bars.get(req.assetId);
    if (!a || !per || req.to < req.from) return [];
    const lo = req.from - (req.from % CANDLE_SPAN[req.res]);
    const out: Candle[] = [];
    for (const b of per[req.res]) {
      if ((b.t < lo || b.t > req.to) && !(since !== undefined && b.rv > since)) continue;
      const dp = a.displayDecimals;
      out.push({ t: b.t, o: fmt(b.o, dp), h: fmt(b.h, dp), l: fmt(b.l, dp), c: fmt(b.c, dp), v: String(b.v) });
      if (out.length >= CANDLE_KEEP) break;
    }
    return out;
  }
}

function findBar(list: MinorBar[], t: number): MinorBar | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i]!;
    if (b.t === t) return b;
    if (b.t < t) return undefined;
  }
  return undefined;
}

const globalForCandles = globalThis as typeof globalThis & {
  __portAvalonCandles?: { recorder: CandleRecorder; market: LiveMarket };
};

/** Process singleton bound to one clock: samples it now and after every step. A swapped clock (tests) gets a new history. */
export function getCandles(market: LiveMarket): CandleRecorder {
  const cur = globalForCandles.__portAvalonCandles;
  if (cur && cur.market === market) return cur.recorder;
  const recorder = new CandleRecorder();
  recorder.sample(market.snapshot());
  market.onStep(() => recorder.sample(market.snapshot()));
  market.onList(() => recorder.sample(market.snapshot(), true));
  globalForCandles.__portAvalonCandles = { recorder, market };
  return recorder;
}

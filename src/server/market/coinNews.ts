// 16 causal news on a listed (graduated) coin, from committed events only (16 §3.6.1 N1/N2: every item cites its event
// and states only what is true at its publish tick): the listing ("launches … IPOs", a fresh graduation) and 05's large
// moves (±mkt_halt_l1 15% / l2 30% from the day's open, each level at most once a game day; crypto does not halt, so
// these are news levels only). Newsworthiness 16 §3.6.2; attention and the news sign (05 §3.14.1, T05-14) and hype
// mentions (06 §3.11.3) are read from the published items. docs/v1/LAUNCHPAD.md "Graduated-coin trader inputs".
// In memory with the clock's Wire (a restart is a new epoch: no stale listing is published again).
import { TICKS_PER_DAY } from "./meme";

/** 22 §10.9 base weights: IPO ("filing, pricing, first trade"); CRYPTO_INCIDENT (the table's crypto event row: 22
 *  authors no row for 05's large moves; IMPLEMENTATION CHOICE). */
export const NEWS_BASE = { listing: 0.5, move: 0.55 } as const;
/** 16 §3.6.2 reach of a single company; PARAM.news_publish_threshold. */
export const NEWS_REACH = 0.3;
export const NEWS_THRESHOLD = 0.05;
/** 05 §3.9.2 levels (PARAM.mkt_halt_l1 / l2), as moves from the day's open. */
export const MOVE_LEVELS = [0.15, 0.3] as const;

export type CoinNewsKind = "listing" | "move";
export interface CoinNewsItem { tick: number; kind: CoinNewsKind; sign: -1 | 0 | 1; nw: number; level?: number; from?: number; to?: number }

/** 16 §3.6.2 nw = base × magnitude × reach × novelty (no telegraph, no outlet slant here). */
export const newsworthiness = (base: number, magnitude: number, novelty: number): number => base * magnitude * NEWS_REACH * novelty;
/** 1 − 0.5^(game days since the last published item on the same subject and kind); 1 when there is none. */
export const novelty = (tick: number, last: number | undefined): number => (last === undefined ? 1 : 1 - Math.pow(0.5, (tick - last) / TICKS_PER_DAY));

/** What the pools read of a coin's news at a tick (items published before it). */
export interface NewsInputs { attention: number; newsSign: -1 | 0 | 1; mentions: number }

export class CoinNews {
  readonly items: CoinNewsItem[] = [];
  private day = -1;
  private open = 0;
  private fired = new Set<number>();
  private readonly last = new Map<CoinNewsKind, number>();

  private publish(it: Omit<CoinNewsItem, "nw">, base: number, magnitude: number): CoinNewsItem | null {
    const nw = newsworthiness(base, magnitude, novelty(it.tick, this.last.get(it.kind)));
    if (nw < NEWS_THRESHOLD) return null;
    const item = { ...it, nw };
    this.items.push(item);
    this.last.set(it.kind, it.tick);
    const keep = it.tick - TICKS_PER_DAY; // a day of items is all any input reads
    while (this.items.length && this.items[0]!.tick <= keep) this.items.shift();
    return item;
  }

  /** A fresh graduation listed the coin at `tick` at `price` (magnitude 1: IMPLEMENTATION CHOICE, the whole first
   *  trade). Sign 0: a listing says nothing about direction. */
  listing(tick: number, price: number): CoinNewsItem | null {
    this.startDay(tick, price);
    return this.publish({ tick, kind: "listing", sign: 0 }, NEWS_BASE.listing, 1);
  }

  /** Tick N runs; `mark` is the coin's published mark at the end of N−1. A large move of N−1 is published at N (16:
   *  publishTick = eventTick + 1); then a new game day takes N−1's mark as its open. */
  observe(tick: number, mark: number): CoinNewsItem | null {
    if (this.day < 0) { this.startDay(tick, mark); return null; }
    let out: CoinNewsItem | null = null;
    const move = this.open > 0 ? mark / this.open - 1 : 0;
    const crossed = MOVE_LEVELS.filter((l) => Math.abs(move) >= l && !this.fired.has(l));
    if (crossed.length) {
      for (const l of crossed) this.fired.add(l);
      const level = crossed.at(-1)!;
      out = this.publish({ tick, kind: "move", sign: move > 0 ? 1 : -1, level, from: this.open, to: mark }, NEWS_BASE.move, Math.min(1, Math.abs(move) / MOVE_LEVELS[1]));
    }
    if (Math.floor(tick / TICKS_PER_DAY) > this.day) this.startDay(tick, mark);
    return out;
  }

  private startDay(tick: number, open: number): void { this.day = Math.floor(tick / TICKS_PER_DAY); this.open = open; this.fired = new Set(); }

  /** attention = 1 + min(1, Σ nw of today's items); newsSign = sign(Σ sign·nw today); mentions = min(1, Σ nw over the
   *  last 24 game hours) (IMPLEMENTATION CHOICE: 06's normalization). Items published before `tick` only. */
  inputs(tick: number): NewsInputs {
    const today = Math.floor((tick - 1) / TICKS_PER_DAY);
    let att = 0, signed = 0, m = 0;
    for (const it of this.items) {
      if (it.tick >= tick) continue;
      if (Math.floor(it.tick / TICKS_PER_DAY) === today) { att += it.nw; signed += it.sign * it.nw; }
      if (it.tick > tick - TICKS_PER_DAY) m += it.nw;
    }
    return { attention: 1 + Math.min(1, att), newsSign: signed > 0 ? 1 : signed < 0 ? -1 : 0, mentions: Math.min(1, m) };
  }
}

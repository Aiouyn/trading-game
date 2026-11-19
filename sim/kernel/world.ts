import { packListedHist } from './bars.ts';
import { EventLog } from './events.ts';
import { Ledger } from './ledger.ts';
import { makeRng, type Rng } from './rng.ts';

// Calendar: 30-day months, 360-day years.
export const DAYS_PER_MONTH = 30, DAYS_PER_YEAR = 360;

/** A module owns a slice of world state (w.state[id]) and runs in the order modules are registered. */
export interface Module {
  id: string;
  init?(w: World): void;                    // build actors, instruments, opening balances
  tick?(w: World, tickOfDay: number): void; // intraday (markets)
  dayClose?(w: World): void;                // once per day
  monthEnd?(w: World): void;                // every 30 days, after dayClose
  stats?(w: World): Record<string, number | string>; // what the headless run prints each year
}

export class World {
  day = 0;
  ticksPerDay: number;
  seed: string;
  ledger = new Ledger();
  events = new EventLog();
  state: Record<string, any> = {};
  modules: Module[] = [];
  genesis: number;
  private streams = new Map<string, Rng>();

  constructor(seed: string, ticksPerDay = 1) {
    this.seed = seed; this.ticksPerDay = ticksPerDay;
    this.genesis = this.events.exo('genesis', `world created from seed '${seed}'`);
  }
  /** A named random stream. Only tagged outside shocks and market microstructure noise may draw from one. */
  rng(key: string): Rng { let r = this.streams.get(key); if (!r) { r = makeRng(`${this.seed}:${key}`); this.streams.set(key, r); } return r; }
  use(m: Module): this { this.modules.push(m); m.init?.(this); return this; }
  get year(): number { return Math.floor(this.day / DAYS_PER_YEAR); }
  get month(): number { return Math.floor(this.day / DAYS_PER_MONTH); }

  /** Ticks of the current day already run. The live server runs them one at a time through the game day; step() finishes the rest. */
  tickDone = 0;
  /** Run the next intraday tick (live play). Returns the tick that ran, or -1 when the day has no ticks left. */
  runTick(): number {
    if (this.tickDone >= this.ticksPerDay) return -1;
    this.ledger.day = this.events.day = this.day;
    const t = this.tickDone++;
    for (const m of this.modules) m.tick?.(this, t);
    return t;
  }

  step(): void {
    this.ledger.day = this.events.day = this.day;
    while (this.tickDone < this.ticksPerDay) this.runTick();
    this.tickDone = 0;
    for (const m of this.modules) m.dayClose?.(this);
    if ((this.day + 1) % DAYS_PER_MONTH === 0) {
      for (const m of this.modules) m.monthEnd?.(this);
      this.events.compact(this.day);
    }
    packListedHist(this);
    this.day++;
  }
}

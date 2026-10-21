// T02-06: per-partition stream manager with the RNG ledger (02 §3.10.2–§3.10.6, §3.11.4).
import { SortedMap } from '../sorted';
import { EngineFault } from '../types';
import type { Tick } from '../types';
import { matchStream, streamPrefix } from './registry';
import { mixEntropy, seedStream } from './stream';
import type { RngStreamState, RootKind } from './stream';
import { makeRng } from './variates';
import type { Rng } from './variates';
import { xoNext } from './xoshiro';

/** publicRoot(k): 32 bytes per epoch; secretEpochRoot(k) = SHA-256('TYC/secret-epoch' ‖ secretRoot ‖ k) (02 §3.11.4). */
export interface EpochRoots { publicRoot(epoch: number): Uint8Array; secretEpochRoot(epoch: number): Uint8Array }
export interface RngLedgerRow { key: string; draws: number }

interface Checkpoint { states: [string, RngStreamState][]; ledger: [string, number][]; tick: number; epoch: number; words: Uint32Array }
const copyState = (s: RngStreamState): RngStreamState => ({ ...s, keyHash: s.keyHash.slice(), s: s.s.slice() });

export class RngManager {
  private readonly roots: EpochRoots;
  private readonly st: SortedMap<string, RngStreamState>;
  private counts = new SortedMap<string, number>();
  private tick = -1;
  private epoch = -1;
  private words = new Uint32Array(8);

  constructor(roots: EpochRoots, state?: SortedMap<string, RngStreamState>) {
    this.roots = roots;
    this.st = state ?? new SortedMap<string, RngStreamState>();
  }

  private rootBytes(root: RootKind, epoch: number): Uint8Array {
    return root === 'SECRET' ? this.roots.secretEpochRoot(epoch) : this.roots.publicRoot(epoch);
  }

  /** Starts tick `tick`. Any stream seeded in an older epoch is re-seeded with the current epoch root before any draw (02 §3.11.4);
   *  mixing then happens lazily on its first draw of the tick. The per-tick ledger is reset. */
  beginTick(tick: Tick, epoch: number, entropyWords: Uint32Array): void {
    if (entropyWords.length < 4) throw new EngineFault('I0.rng_entropy', 'entropy needs at least 4 words');
    this.tick = tick; this.epoch = epoch; this.words = entropyWords.slice();
    this.counts = new SortedMap<string, number>();
    const stale: RngStreamState[] = [];
    for (const v of this.st.values()) if (v.epoch !== epoch) stale.push(v);
    for (const v of stale) {
      const fresh = seedStream(v.key, v.root, this.rootBytes(v.root, epoch), epoch);
      fresh.draws = v.draws;   // the lifetime counter survives re-seeding (telemetry, replay check)
      this.st.set(v.key, fresh);
    }
  }

  /** Stream `key` for module `module` whose ModuleDef.streams are `ownedPrefixes`. Unregistered (or harness-only) keys fault
   *  'I0.rng_unregistered'; another module's stream, or a prefix the module did not declare, faults 'I0.rng_foreign'. */
  stream(module: string, ownedPrefixes: readonly string[], key: string): Rng {
    const spec = matchStream(key);
    if (!spec || spec.root === 'HARNESS') throw new EngineFault('I0.rng_unregistered', `stream '${key}' is not in the 02 §3.10.4 registry for the live world`);
    const prefix = streamPrefix(spec);
    if (spec.module !== module || !ownedPrefixes.includes(prefix)) {
      throw new EngineFault('I0.rng_foreign', `module ${module} may not draw from '${key}' (owner ${spec.module}, prefix ${prefix})`);
    }
    if (this.tick < 0) throw new EngineFault('I0.rng_no_tick', 'RngManager.stream before beginTick');
    const root: RootKind = spec.root;
    return makeRng(() => {
      let s = this.st.get(key);
      if (!s) { s = seedStream(key, root, this.rootBytes(root, this.epoch), this.epoch); this.st.set(key, s); }
      if (s.lastMixedTick < this.tick) mixEntropy(s, this.tick, this.words);
      const out = xoNext(s.s);
      s.draws += 1n;
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
      return out;
    });
  }

  /** This tick's draws per key, ascending by key (cmpStr). */
  ledger(): RngLedgerRow[] {
    const out: RngLedgerRow[] = [];
    for (const [key, draws] of this.counts) out.push({ key, draws });
    return out;
  }
  drawsBigint(key: string): bigint { return this.st.get(key)?.draws ?? 0n; }
  /** Persisted in partition state (snapshot). */
  state(): SortedMap<string, RngStreamState> { return this.st; }

  checkpoint(): unknown {
    const c: Checkpoint = {
      states: [...this.st.entries()].map(([k, v]) => [k, copyState(v)]),
      ledger: [...this.counts.entries()], tick: this.tick, epoch: this.epoch, words: this.words.slice(),
    };
    return c;
  }
  restore(c: unknown): void {
    const cp = c as Checkpoint;
    for (const k of [...this.st.keys()]) this.st.delete(k);
    for (const [k, v] of cp.states) this.st.set(k, copyState(v));
    this.counts = new SortedMap<string, number>(cp.ledger);
    this.tick = cp.tick; this.epoch = cp.epoch; this.words = cp.words.slice();
  }
}

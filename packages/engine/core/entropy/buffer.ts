import { hmacSha256 } from '../crypto/hmac';
import { sha256Concat } from '../crypto/sha256';
import { fromHex, toHex, u64be, utf8 } from '../crypto/hex';
import { concatBytes } from '../crypto/sha256';
import { SortedMap } from '../sorted';

export interface EntropySource { random32(): Uint8Array }
export interface EpochCommit { epoch: number; commit: string; publishedAtTick: number }

export class EntropyChangeRefused extends Error {
  readonly code: 'ENT_ALREADY_COMMITTED' | 'ENT_UNKNOWN_EPOCH' | 'ENT_NOT_REVEALABLE';
  constructor(code: EntropyChangeRefused['code'], message: string) { super(message); this.name = 'EntropyChangeRefused'; this.code = code; }
}

/** SHA-256("tycoon-entropy" ‖ u64be(e) ‖ S_e) */
export function epochCommitHash(epoch: number, secret: Uint8Array): Uint8Array { return sha256Concat('tycoon-entropy', u64be(BigInt(epoch)), secret); }
export function verifyReveal(c: EpochCommit, secretHex: string): boolean { return toHex(epochCommitHash(c.epoch, fromHex(secretHex))) === c.commit; }

const key = (e: number): string => e.toString().padStart(12, '0'); // sorted map key in numeric order

interface BufState { secrets: [number, string][]; commits: EpochCommit[]; revealed: number[] }

/** Coordinator commit-reveal buffer (24 R28 / 19 §3.12). Secrets are only ever created by ensureCommitted. */
export class EntropyBuffer {
  private readonly epochTicks: number; private readonly revealLagTicks: number; private readonly source: EntropySource;
  private secrets = new SortedMap<string, Uint8Array>();
  private commits = new SortedMap<string, EpochCommit>();
  private revealed = new SortedMap<string, true>();
  constructor(o: { worldId: string; epochTicks: number; revealLagTicks: number; source: EntropySource; state?: unknown }) {
    this.epochTicks = o.epochTicks; this.revealLagTicks = o.revealLagTicks; this.source = o.source;
    const s = o.state as BufState | undefined;
    if (s) {
      for (const [e, h] of s.secrets) this.secrets.set(key(e), fromHex(h));
      for (const c of s.commits) this.commits.set(key(c.epoch), { ...c });
      for (const e of s.revealed) this.revealed.set(key(e), true);
    }
  }
  epochOf(tick: number): number { return Math.floor(tick / this.epochTicks); }
  /** Creates S_e for every e ≤ epochOf(currentTick) + 2 not yet created. Epochs 0-1 are published in the genesis header (tick 0). */
  ensureCommitted(currentTick: number): EpochCommit[] {
    const made: EpochCommit[] = [];
    for (let e = 0; e <= this.epochOf(currentTick) + 2; e++) {
      if (this.commits.has(key(e))) continue;
      const s = this.source.random32();
      const c: EpochCommit = { epoch: e, commit: toHex(epochCommitHash(e, s)), publishedAtTick: e < 2 ? 0 : (e - 1) * this.epochTicks - 1 };
      this.secrets.set(key(e), s); this.commits.set(key(e), c); made.push({ ...c });
    }
    return made;
  }
  commitments(): EpochCommit[] { return [...this.commits.values()].map((c) => ({ ...c })); }
  eOf(tick: number): { value: Uint8Array; fallback: boolean } {
    const s = this.secrets.get(key(this.epochOf(tick)));
    if (!s) return { value: new Uint8Array(32), fallback: true };
    return { value: hmacSha256(s, concatBytes([utf8('tick'), u64be(BigInt(tick))])), fallback: false };
  }
  setSecret(epoch: number, _secret: Uint8Array): never {
    if (this.commits.has(key(epoch))) throw new EntropyChangeRefused('ENT_ALREADY_COMMITTED', `epoch ${epoch} is committed`);
    throw new EntropyChangeRefused('ENT_UNKNOWN_EPOCH', `epoch ${epoch} has no commitment; secrets are never injected`);
  }
  reveal(currentTick: number): { epoch: number; secret: string }[] {
    const out: { epoch: number; secret: string }[] = [];
    for (const [k, s] of this.secrets) {
      const e = Number(k);
      if (this.revealed.has(k) || currentTick < (e + 1) * this.epochTicks - 1 + this.revealLagTicks) continue;
      out.push({ epoch: e, secret: toHex(s) });
    }
    for (const r of out) this.revealed.set(key(r.epoch), true);
    return out;
  }
  state(): unknown {
    const st: BufState = { secrets: [...this.secrets].map(([k, s]) => [Number(k), toHex(s)]), commits: this.commitments(), revealed: [...this.revealed.keys()].map(Number) };
    return st;
  }
}

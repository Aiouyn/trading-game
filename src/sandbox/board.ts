import { SANDBOX } from './config';
import { SandboxError, type Sandbox } from './sandbox';

/**
 * The weekly challenge's local board (M19). Local only in V1: no network request, nothing leaves the page.
 *
 * An entry is a score and nothing else: no positions, no trades, no style, no player id. Only a live challenge run
 * that played to its last tick can be submitted. Practice, scenario and imported runs are never ranked.
 */
export interface BoardEntry {
  weekKey: string;
  scenarioId: string;
  equity: number;
  returnPct: number;
  days: number;
  /** submission order, so ties keep the earlier entry first */
  seq: number;
}

export class ChallengeBoard {
  private entries: BoardEntry[] = [];
  private seq = 0;
  /** a run counts once: its entry is remembered here after the first submit */
  private done = new WeakMap<Sandbox, BoardEntry>();

  /** Score a finished challenge run. A second submit of the same run returns its first entry. */
  submit(sb: Sandbox): BoardEntry {
    const prior = this.done.get(sb);
    if (prior) return prior;
    if (sb.origin !== 'live' || sb.plan.kind !== 'challenge' || sb.plan.weekKey === null || sb.plan.days === null) {
      throw new SandboxError('not-ranked');
    }
    if (!sb.complete) throw new SandboxError('not-complete');
    const v = sb.view();
    const entry: BoardEntry = {
      weekKey: sb.plan.weekKey,
      scenarioId: sb.plan.scenarioId ?? '',
      equity: v.equity,
      returnPct: v.returnPct,
      days: sb.plan.days,
      seq: ++this.seq,
    };
    this.done.set(sb, entry);
    this.entries.push(entry);
    this.trim(entry.weekKey);
    return entry;
  }

  /** The week's board: best equity first, earlier submissions first on a tie. */
  top(weekKey: string, n: number = SANDBOX.boardSize): BoardEntry[] {
    return this.entries
      .filter((e) => e.weekKey === weekKey)
      .sort((a, b) => b.equity - a.equity || a.seq - b.seq)
      .slice(0, n);
  }

  /** keep only the best `boardSize` entries of a week */
  private trim(weekKey: string): void {
    const keep = new Set(this.top(weekKey).map((e) => e.seq));
    this.entries = this.entries.filter((e) => e.weekKey !== weekKey || keep.has(e.seq));
  }
}

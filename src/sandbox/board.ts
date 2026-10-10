import { SANDBOX } from './config';
import { SandboxError, type Sandbox } from './sandbox';

/**
 * The weekly challenge's local board (M19). Local only in V1: no network request, nothing leaves the page.
 *
 * An entry is a score and nothing else: no positions, no trades, no style, no player id. Each ISO week has one attempt.
 * The attempt is claimed when its live run is created (rpc.ts), so a player cannot create several runs for the same
 * deterministic market and keep the best. Only the claimed run that played to its last tick can be submitted.
 * Practice, scenario and imported runs are never ranked.
 *
 * The claim here lasts for this page session. Across reloads the week's attempt is kept on the player's server record
 * (challenge.claim in src/world/learn.ts), which the Practice tab takes before it opens the run. The board itself is local
 * by design.
 */
export interface BoardEntry {
  weekKey: string;
  scenarioId: string;
  equity: number;
  returnPct: number;
  days: number;
  /** submission order */
  seq: number;
}

interface Attempt {
  sb: Sandbox;
  entry: BoardEntry | null;
}

export class ChallengeBoard {
  private entries: BoardEntry[] = [];
  private seq = 0;
  /** the week's one attempt, by ISO week key */
  private attempts = new Map<string, Attempt>();

  /** Claim the week's one attempt for a new live challenge run. A second claim for the same week is refused. */
  claim(sb: Sandbox): void {
    const week = rankableWeek(sb);
    if (this.attempts.has(week)) throw new SandboxError('already-attempted');
    this.attempts.set(week, { sb, entry: null });
  }

  /** Score the claimed run once it has played to its last tick. Submitting it again returns the same entry. */
  submit(sb: Sandbox): BoardEntry {
    const week = rankableWeek(sb);
    const a = this.attempts.get(week);
    if (!a || a.sb !== sb) throw new SandboxError('not-ranked', 'no claimed attempt for this week');
    if (a.entry) return a.entry;
    if (!sb.complete) throw new SandboxError('not-complete');
    const v = sb.view();
    const entry: BoardEntry = {
      weekKey: week,
      scenarioId: sb.plan.scenarioId ?? '',
      equity: v.equity,
      returnPct: v.returnPct,
      days: sb.plan.days ?? 0,
      seq: ++this.seq,
    };
    a.entry = entry;
    this.entries.push(entry);
    return entry;
  }

  /** The week's board, best equity first (a week holds at most one entry, so this is at most one row). */
  top(weekKey: string, n: number = SANDBOX.boardSize): BoardEntry[] {
    return this.entries
      .filter((e) => e.weekKey === weekKey)
      .sort((a, b) => b.equity - a.equity || a.seq - b.seq)
      .slice(0, n);
  }
}

/** The ISO week a sandbox can be ranked for: a live, complete-able challenge run. */
function rankableWeek(sb: Sandbox): string {
  if (sb.origin !== 'live' || sb.plan.kind !== 'challenge' || sb.plan.weekKey === null || sb.plan.days === null) {
    throw new SandboxError('not-ranked');
  }
  return sb.plan.weekKey;
}

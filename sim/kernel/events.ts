// Causality log. Every event names the events that caused it. The only events allowed to have no cause
// are tagged exogenous shocks (weather, invention, election...) and genesis. This is the rule that makes
// "why did X happen" answerable with a real chain.
export interface Ev { id: number; day: number; kind: string; actor?: string; msg: string; causes: number[]; exo: boolean }

// Chart series stay get()-able for the whole run. Rare beats do too. High-volume story
// kinds are handed to onFold (a capped per-person record) instead of kept one-by-one.
const CHART_KIND = new Set([
  'genesis',
  'macro.jobs', 'macro.cpi', 'macro.demand', 'macro.wage',
  'cb.rate', 'fx.rate', 'energy.price',
]);
const KEEP_KIND = new Set([
  'person.died', 'person.born',
  'firm.cashCrunch', 'firm.failed', 'firm.default', 'firm.ceoFired',
  'firm.succession', 'firm.takeover', 'firm.founded', 'firm.listed',
  'loan.default', 'bank.run', 'bank.fail',
]);
export function keptForever(kind: string): boolean {
  if (CHART_KIND.has(kind) || KEEP_KIND.has(kind)) return true;
  return kind.startsWith('shock.') || kind.startsWith('player.') || kind.startsWith('court.');
}
function foldKind(kind: string): boolean {
  if (kind === 'life.tally' || keptForever(kind)) return false;
  if (kind.startsWith('life.')) return true;
  return kind.startsWith('person.') || kind.startsWith('firm.') || kind.startsWith('loan.')
    || kind.startsWith('law.') || kind.startsWith('health.') || kind.startsWith('property.');
}

export class EventLog {
  private evs: Ev[] = [];
  private base = 0;
  private lastByKind = new Map<string, number>();
  // Kept events older than the window. Columns, not objects: a Map of Ev held the heap open.
  private archAt = new Map<number, number>();
  private archDay: number[] = [];
  private archKind: string[] = [];
  private archActor: string[] = [];
  private archMsg: string[] = [];
  private archExo: number[] = [];
  private archCause: number[][] = [];
  cap = 400_000;
  /** Days of full detail kept in front of the archive. Society looks back a year; this is two. */
  keepDays = 720;
  /** Story events leaving the window. Set by the history fold so a person's past still reads. */
  onFold?: (e: Ev) => void;
  day = 0;

  /** Record an event. `causes` are ids of earlier events. Use exo() for tagged outside shocks. */
  emit(kind: string, msg: string, causes: number[], actor?: string): number {
    if (causes.length === 0) throw new Error(`event '${kind}' has no cause. Give it one, or use exo() for a tagged outside shock.`);
    return this.push(kind, msg, causes, actor, false);
  }
  /** A tagged exogenous root cause. Keep these rare and named. */
  exo(kind: string, msg: string, actor?: string): number { return this.push(kind, msg, [], actor, true); }

  private push(kind: string, msg: string, causes: number[], actor: string | undefined, exo: boolean): number {
    const id = this.base + this.evs.length;
    this.evs.push({ id, day: this.day, kind, actor, msg, causes: [...new Set(causes)], exo });
    this.lastByKind.set(kind, id);
    if (this.evs.length > this.cap) this.dropPrefix(this.cap >> 2);
    return id;
  }
  private shelve(e: Ev): void {
    const i = this.archDay.length;
    this.archAt.set(e.id, i);
    this.archDay.push(e.day);
    this.archKind.push(e.kind);
    this.archActor.push(e.actor ?? '');
    this.archMsg.push(e.msg);
    this.archExo.push(e.exo ? 1 : 0);
    this.archCause.push(e.causes);
  }
  private dropPrefix(n: number): void {
    if (n <= 0) return;
    for (let i = 0; i < n; i++) {
      const e = this.evs[i];
      if (keptForever(e.kind)) this.shelve(e);
      else if (e.actor && foldKind(e.kind)) this.onFold?.(e);
      else if (!e.actor && e.kind.startsWith('life.') && e.kind !== 'life.tally') this.onFold?.(e);
    }
    this.evs.splice(0, n);
    this.base += n;
  }
  get(id: number): Ev | undefined {
    if (id >= this.base) return this.evs[id - this.base];
    const i = this.archAt.get(id);
    if (i === undefined) return;
    // Write-through so a later edit of an old arrival line still sticks. The object is not retained.
    const self = this;
    return {
      id,
      get day() { return self.archDay[i]; },
      get kind() { return self.archKind[i]; },
      get actor() { const a = self.archActor[i]; return a || undefined; },
      set actor(v: string | undefined) { self.archActor[i] = v ?? ''; },
      get msg() { return self.archMsg[i]; },
      set msg(v: string) { self.archMsg[i] = v; },
      get causes() { return self.archCause[i]; },
      get exo() { return self.archExo[i] === 1; },
      set exo(v: boolean) { self.archExo[i] = v ? 1 : 0; },
    };
  }
  /**
   * Drop bulk events older than keepDays. Chart and story kinds move to the archive so a
   * later get() still finds them. The recent window stays a dense array, so a backward
   * scan of the last year never walks a hole. Ids do not move.
   */
  compact(today: number): void {
    const cut = today - this.keepDays;
    if (cut <= 0 || this.evs.length === 0) return;
    let n = 0;
    while (n < this.evs.length && this.evs[n].day < cut) n++;
    if (n > 0) this.dropPrefix(n);
  }
  last(kind: string): number | undefined { return this.lastByKind.get(kind); }
  get count(): number { return this.base + this.evs.length; }
  /** The most recent `n` events whose kind is in `kinds`, oldest first. */
  recent(kinds: string[], n: number): Ev[] { const out: Ev[] = []; for (let i = this.evs.length - 1; i >= 0 && out.length < n; i--) if (kinds.includes(this.evs[i].kind)) out.push(this.evs[i]); return out.reverse(); }

  /** The causal chain behind an event, as indented lines. */
  explain(id: number, maxDepth = 10): string[] {
    const out: string[] = [], seen = new Set<number>();
    const walk = (i: number, d: number): void => {
      const e = this.get(i);
      if (!e) { out.push(`${'  '.repeat(d)}(event ${i} is older than the log keeps)`); return; }
      const again = seen.has(i);
      out.push(`${'  '.repeat(d)}${d ? '<- ' : ''}[day ${e.day}] ${e.kind}${e.actor ? ' ' + e.actor : ''}: ${e.msg}${e.exo ? '  (outside shock)' : ''}${again ? '  (see above)' : ''}`);
      if (again || d >= maxDepth) return;
      seen.add(i);
      for (const c of e.causes) walk(c, d + 1);
    };
    walk(id, 0);
    return out;
  }
}

// Causality log. Every event names the events that caused it. The only events allowed to have no cause
// are tagged exogenous shocks (weather, invention, election...) and genesis. This is the rule that makes
// "why did X happen" answerable with a real chain.
export interface Ev { id: number; day: number; kind: string; actor?: string; msg: string; causes: number[]; exo: boolean }

export class EventLog {
  private evs: Ev[] = [];
  private base = 0;
  private lastByKind = new Map<string, number>();
  cap = 400_000;
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
    if (this.evs.length > this.cap) { const drop = this.cap >> 2; this.evs.splice(0, drop); this.base += drop; }
    return id;
  }
  get(id: number): Ev | undefined { return this.evs[id - this.base]; }
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

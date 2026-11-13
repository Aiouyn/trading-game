// Balance-sheet ledger. Everything of value is an instrument held by an actor.
//   money / claim : a financial claim with an issuer. Holder's asset = issuer's liability. Integer cents.
//   share         : equity issued by a firm or bank. Integer units. Not a liability.
//   real          : physical goods. Created only by produce(), destroyed only by consume().
// Invariant: for every financial instrument, the sum of all holdings equals the amount issued. Net worth is derived.
export type InstrKind = 'money' | 'claim' | 'share' | 'real';
export interface Instrument { id: string; kind: InstrKind; issuer?: string }
export interface Posting { day: number; op: 'issue' | 'redeem' | 'move' | 'produce' | 'consume'; instr: string; from?: string; to?: string; amount: number; reason: string; cause: number }

export class Ledger {
  actors = new Map<string, string>();                 // id -> kind
  instruments = new Map<string, Instrument>();
  private hold = new Map<string, Map<string, number>>(); // instr -> actor -> amount
  issued = new Map<string, number>();
  private heldBy = new Map<string, Set<string>>();   // actor -> instruments it has ever held (index for netWorth)
  private issuedBy = new Map<string, string[]>();    // issuer -> instruments it issued
  flows = new Map<string, number>();                  // reason -> cumulative amount
  journal: Posting[] = [];
  journalCap = 0; // set > 0 to keep the last postings for debugging
  day = 0;

  addActor(id: string, kind: string): void { if (this.actors.has(id)) throw new Error(`actor ${id} exists`); this.actors.set(id, kind); }
  define(i: Instrument): void {
    if (this.instruments.has(i.id)) throw new Error(`instrument ${i.id} exists`);
    if (i.kind !== 'real' && (!i.issuer || !this.actors.has(i.issuer))) throw new Error(`instrument ${i.id} needs a known issuer`);
    this.instruments.set(i.id, i); this.hold.set(i.id, new Map()); this.issued.set(i.id, 0);
    if (i.issuer) { const l = this.issuedBy.get(i.issuer) ?? []; l.push(i.id); this.issuedBy.set(i.issuer, l); }
  }
  balance(actor: string, instr: string): number { return this.hold.get(instr)?.get(actor) ?? 0; }
  holders(instr: string): ReadonlyMap<string, number> { return this.hold.get(instr) ?? new Map(); }

  private chk(instr: string, amount: number, cause: number, ...who: string[]): Instrument {
    const i = this.instruments.get(instr);
    if (!i) throw new Error(`unknown instrument ${instr}`);
    if (!(amount >= 0) || !Number.isFinite(amount)) throw new Error(`bad amount ${amount} on ${instr}`);
    if (i.kind !== 'real' && !Number.isSafeInteger(amount)) throw new Error(`${instr} amounts must be integers, got ${amount}`);
    if (typeof cause !== 'number') throw new Error(`posting on ${instr} needs a cause event id`);
    for (const w of who) if (!this.actors.has(w)) throw new Error(`unknown actor ${w}`);
    return i;
  }
  private add(instr: string, actor: string, d: number): void {
    const m = this.hold.get(instr)!, was = m.get(actor);
    if (was === undefined) { let h = this.heldBy.get(actor); if (!h) { h = new Set(); this.heldBy.set(actor, h); } h.add(instr); }
    m.set(actor, (was ?? 0) + d);
  }
  private log(p: Omit<Posting, 'day'>): void {
    this.flows.set(p.reason, (this.flows.get(p.reason) ?? 0) + p.amount);
    if (!this.journalCap) return;
    this.journal.push({ day: this.day, ...p });
    if (this.journal.length > this.journalCap) this.journal.splice(0, this.journalCap >> 1);
  }

  /** Create a financial claim: `to` gains an asset, the issuer gains a liability (or equity, for shares). */
  issue(instr: string, to: string, amount: number, reason: string, cause: number): void {
    const i = this.chk(instr, amount, cause, to);
    if (i.kind === 'real') throw new Error('use produce() for real goods');
    if (amount === 0) return;
    this.add(instr, to, amount); this.issued.set(instr, this.issued.get(instr)! + amount);
    this.log({ op: 'issue', instr, to, amount, reason, cause });
  }
  /** Extinguish a financial claim held by `from`. False if `from` does not hold enough. */
  redeem(instr: string, from: string, amount: number, reason: string, cause: number): boolean {
    const i = this.chk(instr, amount, cause, from);
    if (i.kind === 'real') throw new Error('use consume() for real goods');
    if (amount === 0) return true;
    if (this.balance(from, instr) < amount) return false;
    this.add(instr, from, -amount); this.issued.set(instr, this.issued.get(instr)! - amount);
    this.log({ op: 'redeem', instr, from, amount, reason, cause });
    return true;
  }
  /** Move a holding between two actors. All or nothing. */
  move(instr: string, from: string, to: string, amount: number, reason: string, cause: number): boolean {
    this.chk(instr, amount, cause, from, to);
    if (amount === 0 || from === to) return true;
    if (this.balance(from, instr) < amount - 1e-9) return false;
    this.add(instr, from, -amount); this.add(instr, to, amount);
    this.log({ op: 'move', instr, from, to, amount, reason, cause });
    return true;
  }
  produce(instr: string, to: string, qty: number, reason: string, cause: number): void {
    if (qty < 0 && qty > -1e-6) qty = 0; // float dust on physical quantities
    const i = this.chk(instr, qty, cause, to);
    if (i.kind !== 'real') throw new Error('produce() is for real goods');
    if (qty === 0) return;
    this.add(instr, to, qty); this.issued.set(instr, this.issued.get(instr)! + qty);
    this.log({ op: 'produce', instr, to, amount: qty, reason, cause });
  }
  consume(instr: string, from: string, qty: number, reason: string, cause: number): boolean {
    if (qty < 0 && qty > -1e-6) qty = 0; // float dust on physical quantities
    const i = this.chk(instr, qty, cause, from);
    if (i.kind !== 'real') throw new Error('consume() is for real goods');
    if (qty === 0) return true;
    if (this.balance(from, instr) < qty - 1e-6) return false;
    this.add(instr, from, -qty); this.issued.set(instr, this.issued.get(instr)! - qty);
    this.log({ op: 'consume', instr, from, amount: qty, reason, cause });
    return true;
  }

  /** Assets minus liabilities. `price` values shares and real goods (cents per unit); money and claims count at face. */
  netWorth(actor: string, price: (instr: string) => number = () => 0): number {
    let nw = 0;
    for (const id of this.heldBy.get(actor) ?? []) {
      const i = this.instruments.get(id)!, h = this.hold.get(id)!.get(actor) ?? 0;
      if (h) nw += i.kind === 'money' || i.kind === 'claim' ? h : h * price(id);
    }
    for (const id of this.issuedBy.get(actor) ?? []) { const i = this.instruments.get(id)!; if (i.kind === 'money' || i.kind === 'claim') nw -= this.issued.get(id)!; }
    return nw;
  }
  /** Conservation check. Returns problems; empty means the books balance. */
  check(): string[] {
    const bad: string[] = [];
    for (const [id, i] of this.instruments) {
      let sum = 0;
      for (const [a, v] of this.hold.get(id)!) { sum += v; if (v < (i.kind === 'real' ? -1e-6 : 0)) bad.push(`${a} holds negative ${id}: ${v}`); }
      const iss = this.issued.get(id)!;
      if (i.kind === 'real' ? Math.abs(sum - iss) > 1e-3 * Math.max(1, Math.abs(iss)) : sum !== iss) bad.push(`${id}: holdings ${sum} != issued ${iss}`);
    }
    return bad;
  }
  /** Stable fingerprint of all holdings, for determinism checks. */
  hash(): string {
    let h = 0x811c9dc5;
    for (const id of [...this.instruments.keys()].sort()) {
      const m = this.hold.get(id)!;
      for (const a of [...m.keys()].sort()) {
        const s = `${id}|${a}|${this.instruments.get(id)!.kind === 'real' ? m.get(a)!.toFixed(4) : m.get(a)};`;
        for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
      }
    }
    return h.toString(16).padStart(8, '0');
  }
}

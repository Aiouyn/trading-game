// Balance-sheet ledger. Everything of value is an instrument held by an actor.
//   money / claim : a financial claim with an issuer. Holder's asset = issuer's liability. Integer cents.
//   share         : equity issued by a firm or bank. Integer units. Not a liability.
//   real          : physical goods. Created only by produce(), destroyed only by consume().
// Invariant: for every financial instrument, the sum of all holdings equals the amount issued. Net worth is derived.
//
// Built for hundreds of thousands of actors: every actor gets a numeric slot. Money instruments keep balances in one
// dense array indexed by slot (8 bytes per actor, no per-actor objects); everything else is a sparse map keyed by slot.
// Hot loops use the slot API (balS, moveS, issueS, redeemS); everything else may keep using string ids.
export type InstrKind = 'money' | 'claim' | 'share' | 'real';
export interface Instrument { id: string; kind: InstrKind; issuer?: string }
export interface Posting { day: number; op: 'issue' | 'redeem' | 'move' | 'produce' | 'consume'; instr: string; from?: string; to?: string; amount: number; reason: string; cause: number }

interface Store { kind: InstrKind; dense?: Float64Array; sparse?: Map<number, number> }

export class Ledger {
  actors = new Map<string, string>();                 // id -> kind
  instruments = new Map<string, Instrument>();
  issued = new Map<string, number>();
  flows = new Map<string, number>();                  // reason -> cumulative amount
  journal: Posting[] = [];
  journalCap = 0; // set > 0 to keep the last postings for debugging
  day = 0;

  private slotOf = new Map<string, number>();
  ids: string[] = [];                                 // slot -> actor id
  private cap = 1024;
  private stores = new Map<string, Store>();
  private denseIds: string[] = [];
  private heldBy = new Map<number, Set<string>>();    // slot -> sparse instruments it has ever held (index for netWorth)
  private issuedBy = new Map<string, string[]>();     // issuer -> instruments it issued

  addActor(id: string, kind: string): number {
    if (this.actors.has(id)) throw new Error(`actor ${id} exists`);
    const slot = this.ids.length;
    this.actors.set(id, kind); this.slotOf.set(id, slot); this.ids.push(id);
    if (slot >= this.cap) {
      this.cap *= 2;
      for (const st of this.stores.values()) if (st.dense) { const a = new Float64Array(this.cap); a.set(st.dense); st.dense = a; }
    }
    return slot;
  }
  slot(id: string): number { const s = this.slotOf.get(id); if (s === undefined) throw new Error(`unknown actor ${id}`); return s; }
  hasActor(id: string): boolean { return this.slotOf.has(id); }

  define(i: Instrument): void {
    if (this.instruments.has(i.id)) throw new Error(`instrument ${i.id} exists`);
    if (i.kind !== 'real' && (!i.issuer || !this.actors.has(i.issuer))) throw new Error(`instrument ${i.id} needs a known issuer`);
    this.instruments.set(i.id, i); this.issued.set(i.id, 0);
    if (i.kind === 'money') { this.stores.set(i.id, { kind: i.kind, dense: new Float64Array(this.cap) }); this.denseIds.push(i.id); }
    else this.stores.set(i.id, { kind: i.kind, sparse: new Map() });
    if (i.issuer) { const l = this.issuedBy.get(i.issuer) ?? []; l.push(i.id); this.issuedBy.set(i.issuer, l); }
  }

  private st(instr: string): Store { const s = this.stores.get(instr); if (!s) throw new Error(`unknown instrument ${instr}`); return s; }
  balS(slot: number, instr: string): number { const s = this.st(instr); return s.dense ? s.dense[slot] : s.sparse!.get(slot) ?? 0; }
  balance(actor: string, instr: string): number { const sl = this.slotOf.get(actor); return sl === undefined || !this.stores.has(instr) ? 0 : this.balS(sl, instr); }
  /** Holders with a non-zero balance, by actor id. Built on demand: cheap for shares and loans, slow for money. */
  holders(instr: string): ReadonlyMap<string, number> {
    const s = this.stores.get(instr), out = new Map<string, number>();
    if (!s) return out;
    if (s.dense) { for (let k = 0; k < this.ids.length; k++) if (s.dense[k] !== 0) out.set(this.ids[k], s.dense[k]); }
    else for (const [k, v] of s.sparse!) out.set(this.ids[k], v);
    return out;
  }

  private chk(instr: string, amount: number, cause: number): Store {
    const s = this.st(instr);
    if (!(amount >= 0) || !Number.isFinite(amount)) throw new Error(`bad amount ${amount} on ${instr}`);
    if (s.kind !== 'real' && !Number.isSafeInteger(amount)) throw new Error(`${instr} amounts must be integers, got ${amount}`);
    if (typeof cause !== 'number') throw new Error(`posting on ${instr} needs a cause event id`);
    return s;
  }
  private add(s: Store, instr: string, slot: number, d: number): void {
    if (s.dense) { s.dense[slot] += d; return; }
    const m = s.sparse!, was = m.get(slot);
    if (was === undefined) { let h = this.heldBy.get(slot); if (!h) { h = new Set(); this.heldBy.set(slot, h); } h.add(instr); }
    m.set(slot, (was ?? 0) + d);
  }
  private log(op: Posting['op'], instr: string, from: number, to: number, amount: number, reason: string, cause: number): void {
    this.flows.set(reason, (this.flows.get(reason) ?? 0) + amount);
    if (!this.journalCap) return;
    this.journal.push({ day: this.day, op, instr, from: from >= 0 ? this.ids[from] : undefined, to: to >= 0 ? this.ids[to] : undefined, amount, reason, cause });
    if (this.journal.length > this.journalCap) this.journal.splice(0, this.journalCap >> 1);
  }

  // ---- slot API (hot paths) ----
  issueS(instr: string, to: number, amount: number, reason: string, cause: number): void {
    const s = this.chk(instr, amount, cause);
    if (s.kind === 'real') throw new Error('use produce() for real goods');
    if (amount === 0) return;
    this.add(s, instr, to, amount); this.issued.set(instr, this.issued.get(instr)! + amount);
    this.log('issue', instr, -1, to, amount, reason, cause);
  }
  redeemS(instr: string, from: number, amount: number, reason: string, cause: number): boolean {
    const s = this.chk(instr, amount, cause);
    if (s.kind === 'real') throw new Error('use consume() for real goods');
    if (amount === 0) return true;
    if (this.balS(from, instr) < amount) return false;
    this.add(s, instr, from, -amount); this.issued.set(instr, this.issued.get(instr)! - amount);
    this.log('redeem', instr, from, -1, amount, reason, cause);
    return true;
  }
  moveS(instr: string, from: number, to: number, amount: number, reason: string, cause: number): boolean {
    const s = this.chk(instr, amount, cause);
    if (amount === 0 || from === to) return true;
    if (this.balS(from, instr) < amount - 1e-9) return false;
    this.add(s, instr, from, -amount); this.add(s, instr, to, amount);
    this.log('move', instr, from, to, amount, reason, cause);
    return true;
  }
  produceS(instr: string, to: number, qty: number, reason: string, cause: number): void {
    if (qty < 0 && qty > -1e-6) qty = 0; // float dust on physical quantities
    const s = this.chk(instr, qty, cause);
    if (s.kind !== 'real') throw new Error('produce() is for real goods');
    if (qty === 0) return;
    this.add(s, instr, to, qty); this.issued.set(instr, this.issued.get(instr)! + qty);
    this.log('produce', instr, -1, to, qty, reason, cause);
  }
  consumeS(instr: string, from: number, qty: number, reason: string, cause: number): boolean {
    if (qty < 0 && qty > -1e-6) qty = 0;
    const s = this.chk(instr, qty, cause);
    if (s.kind !== 'real') throw new Error('consume() is for real goods');
    if (qty === 0) return true;
    if (this.balS(from, instr) < qty - 1e-6) return false;
    this.add(s, instr, from, -qty); this.issued.set(instr, this.issued.get(instr)! - qty);
    this.log('consume', instr, from, -1, qty, reason, cause);
    return true;
  }

  // ---- string API ----
  /** Create a financial claim: `to` gains an asset, the issuer gains a liability (or equity, for shares). */
  issue(instr: string, to: string, amount: number, reason: string, cause: number): void { this.issueS(instr, this.slot(to), amount, reason, cause); }
  /** Extinguish a financial claim held by `from`. False if `from` does not hold enough. */
  redeem(instr: string, from: string, amount: number, reason: string, cause: number): boolean { return this.redeemS(instr, this.slot(from), amount, reason, cause); }
  /** Move a holding between two actors. All or nothing. */
  move(instr: string, from: string, to: string, amount: number, reason: string, cause: number): boolean { return this.moveS(instr, this.slot(from), this.slot(to), amount, reason, cause); }
  produce(instr: string, to: string, qty: number, reason: string, cause: number): void { this.produceS(instr, this.slot(to), qty, reason, cause); }
  consume(instr: string, from: string, qty: number, reason: string, cause: number): boolean { return this.consumeS(instr, this.slot(from), qty, reason, cause); }

  /** Assets minus liabilities. `price` values shares and real goods (cents per unit); money and claims count at face. */
  netWorth(actor: string, price: (instr: string) => number = () => 0): number {
    const sl = this.slotOf.get(actor);
    if (sl === undefined) return 0;
    let nw = 0;
    for (const id of this.denseIds) nw += this.stores.get(id)!.dense![sl];
    for (const id of this.heldBy.get(sl) ?? []) {
      const s = this.stores.get(id)!, h = s.sparse!.get(sl) ?? 0;
      if (h) nw += s.kind === 'money' || s.kind === 'claim' ? h : h * price(id);
    }
    for (const id of this.issuedBy.get(actor) ?? []) { const i = this.instruments.get(id)!; if (i.kind === 'money' || i.kind === 'claim') nw -= this.issued.get(id)!; }
    return nw;
  }
  /** Conservation check. Returns problems; empty means the books balance. */
  check(): string[] {
    const bad: string[] = [];
    for (const [id, s] of this.stores) {
      let sum = 0;
      const neg = s.kind === 'real' ? -1e-6 : 0;
      if (s.dense) { const a = s.dense; for (let k = 0; k < this.ids.length; k++) { const v = a[k]; sum += v; if (v < neg) bad.push(`${this.ids[k]} holds negative ${id}: ${v}`); } }
      else for (const [k, v] of s.sparse!) { sum += v; if (v < neg) bad.push(`${this.ids[k]} holds negative ${id}: ${v}`); }
      const iss = this.issued.get(id)!;
      if (s.kind === 'real' ? Math.abs(sum - iss) > 1e-3 * Math.max(1, Math.abs(iss)) : sum !== iss) bad.push(`${id}: holdings ${sum} != issued ${iss}`);
    }
    return bad;
  }
  /** Stable fingerprint of all holdings, for determinism checks. */
  hash(): string {
    let h = 0x811c9dc5;
    for (const id of [...this.instruments.keys()].sort()) {
      const m = this.holders(id), real = this.instruments.get(id)!.kind === 'real';
      for (const a of [...m.keys()].sort()) {
        const s = `${id}|${a}|${real ? m.get(a)!.toFixed(4) : m.get(a)};`;
        for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
      }
    }
    return h.toString(16).padStart(8, '0');
  }
}

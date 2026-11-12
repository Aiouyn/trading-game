import assert from "node:assert/strict";
import { financialCells } from "../../src/server/banking-core/engine";
import type { CoreState } from "../../src/server/banking-core/model";

/** Genesis in fixture or checkpoint-wire form: every amount is read with BigInt(). */
export type AuditGenesis = { ledger: { banks: { id: string; reserves: string }[]; accounts: { id: string; bankId: string | null; cash: string }[]; assets: { id: string; markPpm: number; holdings: { bankId: string | null; accountId: string | null; quantity: string }[] }[]; notes: { id: string; bankId: string; creditor: string; instrument: string; amount: string }[]; dgf: { bloc: string; cash: string }[] } };
const Z = BigInt(0), M = BigInt(1000000), sum = (v: Iterable<bigint>) => [...v].reduce((a, b) => a + b, Z);
type G = AuditGenesis;

/** Independent cell reconstruction: genesis cells plus every audited phase change must equal the final engine cells; base money never moves; each bank's sheet balances after every audited tick. */
export function independent(g: G, s: CoreState, exact: string[] = []) {
    const cells = new Map<string, string>(Object.entries(financialCells(s)).map(([k]) => [k, "~"]));
    const seed = new Map<string, string>();
    for (const b of g.ledger.banks) seed.set("reserve:" + JSON.stringify(b.id), BigInt(b.reserves).toString());
    for (const a of g.ledger.accounts) seed.set("account:" + JSON.stringify([a.id, a.bankId]), BigInt(a.cash).toString());
    for (const a of g.ledger.assets) { seed.set("mark:" + JSON.stringify(a.id), String(a.markPpm)); for (const h of a.holdings) seed.set("holding:" + JSON.stringify([a.id, h.bankId, h.accountId]), BigInt(h.quantity).toString()); }
    for (const n of g.ledger.notes) seed.set("note:" + JSON.stringify([n.id, n.bankId, n.creditor, n.instrument]), BigInt(n.amount).toString());
    for (const d of g.ledger.dgf) seed.set("dgf:" + JSON.stringify(d.bloc), BigInt(d.cash).toString());
    for (const k of ["mmf:null", "authority:null", "sinks:null"]) seed.set(k, "0");
    cells.clear();
    for (const [k, v] of seed) cells.set(k, v);
    const first = new Map<string, boolean>();
    const restricted = (bankId: string) => sum(s.cashOwnership.filter(r => r.bankId === bankId).map(r => BigInt(cells.get("account:" + JSON.stringify([r.accountId, null])) ?? "0") * BigInt(r.weightPpm) / M));
    const base = () => sum([...cells].filter(([k]) => k.startsWith("reserve:") || k.startsWith("dgf:") || k === "mmf:null" || k === "authority:null" || (k.startsWith("account:") && JSON.parse(k.slice(8))[1] === null)).map(([, v]) => BigInt(v)));
    const opening = base();
    const sheet = (bankId: string) => {
        const deposits = sum([...cells].filter(([k]) => k.startsWith("account:") && JSON.parse(k.slice(8))[1] === bankId).map(([, v]) => BigInt(v)));
        let loans = Z;
        for (const [k, v] of cells) if (k.startsWith("holding:")) { const [id, b] = JSON.parse(k.slice(8)); if (b === bankId) { const n = BigInt(v) * BigInt(cells.get("mark:" + JSON.stringify(id))!), q = n / M, r = n % M; loans += q + (r * BigInt(2) > M || (r * BigInt(2) === M && q % BigInt(2) !== Z) ? BigInt(1) : Z); } }
        const notes = sum([...cells].filter(([k]) => k.startsWith("note:") && JSON.parse(k.slice(5))[1] === bankId).map(([, v]) => BigInt(v)));
        const interbankAssets = sum([...cells].filter(([k]) => k.startsWith("note:") && JSON.parse(k.slice(5))[2] === bankId && JSON.parse(k.slice(5))[3] === "INTERBANK").map(([, v]) => BigInt(v)));
        return { deposits, netLoans: loans, reserves: BigInt(cells.get("reserve:" + JSON.stringify(bankId))!) + restricted(bankId), notes, interbankAssets };
    };
    for (const b of g.ledger.banks) { const x = sheet(b.id); cells.set("equity:" + JSON.stringify(b.id), String(x.reserves + x.netLoans + x.interbankAssets - x.deposits - x.notes)); }
    const identity: { tick: number; bankId: string; deposits: string; equity: string; netLoans: string; reserves: string; residual: string }[] = [];
    const ticks = [...new Set(s.audit.map(a => a.tick))], walk = exact.length ? Array.from({ length: s.tick + 1 }, (_, t) => t) : ticks;
    for (const tick of walk) {
        for (const a of s.audit.filter(a => a.tick === tick)) for (const c of a.changes) { assert.equal(cells.get(c.path) ?? "~", c.before, "AUDIT_CHAIN " + c.path); if (c.after === "~") cells.delete(c.path); else cells.set(c.path, c.after); first.set(c.path, true); }
        assert.equal(base() + BigInt(cells.get("sinks:null")!), opening, "BASE_MONEY_CREATED tick " + tick);
        for (const bankId of exact) {
            const x = sheet(bankId), equity = BigInt(cells.get("equity:" + JSON.stringify(bankId))!);
            assert.equal(x.notes, Z, "exact identity scenario has no notes"); assert.equal(x.interbankAssets, Z);
            const residual = x.deposits + equity - x.netLoans - x.reserves;
            assert.equal(residual, Z, "deposits + equity = net loans + reserves at tick " + tick);
            identity.push({ tick, bankId, deposits: String(x.deposits), equity: String(equity), netLoans: String(x.netLoans), reserves: String(x.reserves), residual: "0" });
        }
    }
    const final = financialCells(s);
    for (const [k, v] of Object.entries(final)) if (!k.startsWith("equity:")) assert.equal(cells.get(k) ?? "~", v, "RECONSTRUCT " + k);
    for (const [k] of cells) if (!k.startsWith("equity:")) assert(k in final, "STALE_CELL " + k);
    const createdByLoans = sum(s.creditBooks.flatMap(b => b.movements.filter(m => m.kind === "CREDIT_CREATE").map(m => m.amount)));
    const destroyed = sum(s.creditBooks.flatMap(b => b.movements.filter(m => m.kind === "REPAY_PRINCIPAL").map(m => m.amount)));
    const outstanding = sum(s.assets.filter(a => a.id.startsWith("@originated/")).flatMap(a => a.holdings.map(h => h.quantity)));
    assert.equal(createdByLoans - destroyed, outstanding, "every originated principal is a CREDIT_CREATE");
    return { auditedPhases: s.audit.length, auditedTicks: ticks.length, baseMoney: String(opening), baseResidual: "0", cellResidual: "0", createdByLoans: String(createdByLoans), destroyedPrincipal: String(destroyed), outstandingOriginated: String(outstanding), originationResidual: "0", identityRows: identity.length, identityTicks: exact.length ? s.tick + 1 : 0, identity };
}
export const auditSummary = (a: ReturnType<typeof independent>) => { const r: Partial<ReturnType<typeof independent>> = { ...a }; delete r.identity; return r; };

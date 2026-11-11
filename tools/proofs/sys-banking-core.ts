import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { BankingCoreEngine, financialCells } from "../../src/server/banking-core/engine";
import { coreWire } from "../../src/server/banking-core/boundary";
import type { CoreState } from "../../src/server/banking-core/model";
import { FileBankingCoreStore } from "../../src/server/banking-core/store";
import * as F from "../../tests/unit/banking-core/fixture";

type Fx = F.CoreFixture;
type Opts = { banking?: boolean; credit?: string[]; liquidity?: boolean; ccp?: { ids: string[]; services: string[] } | null; creditFacts?: (bankId: string, day: number) => unknown };
const Z = BigInt(0), M = BigInt(1000000), sum = (v: Iterable<bigint>) => [...v].reduce((a, b) => a + b, Z);
const sha = (s: string) => createHash("sha256").update(s).digest("hex"), wire = (v: unknown) => { try { return JSON.stringify(coreWire(v)); } catch (e) { const seen = new Map<object, string>(), walk = (x: unknown, p: string) => { if (x === undefined) console.error("UNDEFINED", p); if (typeof x !== "object" || x === null) return; if (seen.has(x)) { console.error("SHARED", p, seen.get(x)); return; } seen.set(x, p); for (const [k, y] of Object.entries(x)) walk(y, p + "." + k); }; walk(v, "$"); throw e; } };
const micro = (n: number) => BigInt(F.usd(n));

/** Fills every frame each enabled module requires at its spec granularity, then applies the scenario edit. */
function build(g: Fx, target: number, o: Opts, edit: (f: F.Frame) => void = () => undefined): F.Frame[] {
    return F.frames(target, f => {
        const t = f.tick;
        if (o.banking && t % 30 === 29) f.banking = F.bankFrame(t);
        for (const id of o.credit ?? []) if (t % 720 === 719) f.credit.push({ bankId: id, frame: F.creditFrame(t, [], o.creditFacts ? o.creditFacts(id, Math.floor(t / 720)) : F.creditFacts(F.creditProfiles())) });
        if (o.liquidity && F.liquidityRequired(t)) f.liquidity = { tick: t, facts: F.liquidityFacts(g.ledger), commands: [] };
        if (o.ccp) f.ccp = { tick: t, facts: F.marginFacts(o.ccp.ids, o.ccp.services), commands: [] };
        edit(f);
    }, () => false);
}
const creditAt = (f: F.Frame, bankId: string, commands: unknown[], facts: unknown) => { const row = f.credit.find(c => c.bankId === bankId); if (row) (row.frame as { commands: unknown[] }).commands.push(...commands); else f.credit.push({ bankId, frame: F.creditFrame(f.tick, commands, facts) }); };

/** Independent cell reconstruction: genesis cells plus every audited phase change must equal the final engine cells; base money never moves; each bank's sheet balances after every audited tick. */
function independent(g: Fx, s: CoreState, exact: string[] = []) {
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

type CF = { facts: { risks: { im: string; positions: unknown[] }[]; defaults: unknown[]; closeouts: unknown[]; vm: unknown[] }; commands: unknown[] };
const cf = (f: F.Frame) => f.ccp as CF;
const reports: unknown[] = [];
const summary = (a: ReturnType<typeof independent>) => { const r: Partial<ReturnType<typeof independent>> = { ...a }; delete r.identity; return r; };
async function scenario(out: string, source: string, name: string, g: Fx, frames: F.Frame[], target: number, inspect: (s: CoreState, e: BankingCoreEngine) => Record<string, unknown>, opt: { literal?: boolean; exact?: string[]; points?: number[] } = {}) {
    const dir = join(out, source + "-" + name);
    await mkdir(dir);
    const path = (m: string) => join(dir, m + ".json");
    const jump = await BankingCoreEngine.open(new FileBankingCoreStore(path("jump")), g, true);
    await jump.advance(target, frames);
    const step = await BankingCoreEngine.open(new FileBankingCoreStore(path("stepped")), g, true);
    let restart = await BankingCoreEngine.open(new FileBankingCoreStore(path("restart")), F.reorder(g), true), reopens = 0;
    const points = opt.literal ? Array.from({ length: target + 1 }, (_, t) => t) : [...new Set([...frames.filter(f => f.banking || f.credit.some(c => (c.frame as { commands: unknown[] }).commands.length) || (f.liquidity && ((f.liquidity as { commands: unknown[] }).commands.length || f.tick % 720 === 719)) || f.ccp && ((f.ccp as { commands: unknown[]; facts: { defaults: unknown[]; closeouts: unknown[]; vm: unknown[] } }).commands.length || (f.ccp as { facts: { defaults: unknown[]; closeouts: unknown[]; vm: unknown[] } }).facts.closeouts.length)).map(f => f.tick).filter(t => t < 3 || (opt.points ?? []).includes(t) || frames.length < 200), ...frames.filter(f => f.tick % 720 === 719).map(f => f.tick), ...(opt.points ?? []), target])].filter(t => t <= target).sort((a, b) => a - b);
    let prev = -1;
    for (const t of points) {
        const rows = frames.filter(f => f.tick > prev && f.tick <= t);
        await step.advance(t, rows);
        await restart.advance(t, F.reorder(rows));
        assert.equal(wire(step.snapshot()), wire(restart.snapshot()));
        if (t % 720 === 719 || t === target) { restart = await BankingCoreEngine.open(new FileBankingCoreStore(path("restart")), F.reorder(g), true); reopens++; }
        prev = t;
    }
    const s = jump.snapshot(), bytes = await Promise.all(["jump", "stepped", "restart"].map(m => readFile(path(m), "utf8")));
    assert.equal(wire(s), wire(step.snapshot())); assert.equal(wire(s), wire(restart.snapshot()));
    assert.equal(bytes[0], bytes[1]); assert.equal(bytes[0], bytes[2]);
    const reopened = await BankingCoreEngine.open(new FileBankingCoreStore(path("jump")), F.reorder(g), true);
    assert.equal(wire(reopened.snapshot()), wire(s));
    const audit = independent(g, s, opt.exact), checks = inspect(s, jump);
    const report = { source, name, target, mode: opt.literal ? "literal every tick" : "stepped at every command/day boundary; every intervening tick reconstructed", steps: points.length, reopens, physicalStores: 3, stateEqual: true, checkpointBytesEqual: true, checkpointSha256: sha(bytes[0]), stateSha256: sha(wire(s)), checks, audit: summary(audit), sheets: jump.sheets() };
    await writeFile(join(dir, "RESULT.json"), wire(report) + "\n");
    if (audit.identity.length) await writeFile(join(dir, "identity-every-tick.json"), wire(audit.identity) + "\n");
    reports.push(report);
    console.log("PASS", source, name, points.length, "steps");
    return s;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--out" || !isAbsolute(args[1])) throw new Error("Usage: npx tsx tools/proofs/sys-banking-core.ts --out /absolute/new-directory");
    const out = args[1];
    await mkdir(out);
    const started = new Date().toISOString();
    // ---- sys/banking 9f22a24d scenarios (LEND retired: origination re-expressed via the credit book at the same bank)
    const bigCompany = (id: string, day: number) => { void id; void day; return F.creditFacts([F.companyProfile("company", 2000000000)]); };
    {
        const g = F.bankingFixture(); g.credit = [F.creditBook("bankA", ["business", "company-wallet"], "other")]; g.ledger.accounts.find(a => a.id === "company-wallet")!.cash = F.usd(10); g.ledger.accounts.find(a => a.id === "alice-wallet")!.cash = F.usd(999999990);
        const o = { banking: true, credit: ["bankA"], creditFacts: bigCompany };
        const frames = build(g, 749, o, f => { if (f.tick === 0) creditAt(f, "bankA", [F.apply("company", 1000, "business", F.term("BULLET", 28))], bigCompany("", 0)); if (f.tick === 1) creditAt(f, "bankA", [F.accept("company")], bigCompany("", 0)); if (f.tick === 2) creditAt(f, "bankA", [{ id: "repay", actor: "company", kind: "REPAY", loanId: F.offerId(), amount: F.usd(1000) }], bigCompany("", 0)); });
        await scenario(out, "banking-9f22a24d", "credit-create-and-repay", g, frames, 749, s => { const b = s.creditBooks[0]; assert.equal(b.loans[0].status, "REPAID"); assert(b.movements.some(m => m.kind === "CREDIT_CREATE")); assert(b.movements.some(m => m.kind === "REPAY_PRINCIPAL")); return { status: b.loans[0].status, created: String(b.movements.find(m => m.kind === "CREDIT_CREATE")!.amount) }; });
    }
    {
        const g = F.bankingFixture(); g.credit = [F.creditBook("bankA", ["business"], "other")];
        const facts = (_: string, day: number) => { void day; return F.creditFacts([F.companyProfile("company", 2000000000)]); };
        const frames = build(g, 2880, { banking: true, credit: ["bankA"], creditFacts: facts }, f => { if (f.tick === 0) creditAt(f, "bankA", [F.apply("company", 1000, "business", F.term("LINEAR", 1))], facts("", 0)); if (f.tick === 1) creditAt(f, "bankA", [F.accept("company")], facts("", 0)); if (f.tick === 2) creditAt(f, "bankA", [{ id: "circulate", actor: "company", kind: "EXPENSE", supplierId: "alice", amount: F.usd(1000) }], facts("", 0)); });
        await scenario(out, "banking-9f22a24d", "default-writeoff-no-deposit-destruction", g, frames, 2880, s => { const l = s.creditBooks[0].loans[0]; assert.equal(l.status, "CHARGED_OFF"); assert.equal(s.accounts.find(a => a.id === "other")!.lots.reduce((n, x) => n + x.amount, Z), micro(1000)); return { status: l.status, otherDeposit: F.usd(1000), writtenOff: String(s.creditBooks[0].writtenOff) }; });
    }
    {
        const g = F.bankingFixture(); g.credit = [F.creditBook("bankA", ["company-wallet"], "other")];
        const frames = build(g, 59, { banking: true, credit: ["bankA"], creditFacts: bigCompany }, f => { if (f.tick === 0) creditAt(f, "bankA", [F.apply("company", 2000000, "company-wallet", F.term())], bigCompany("", 0)); if (f.tick === 1) creditAt(f, "bankA", [F.accept("company")], bigCompany("", 0)); });
        await scenario(out, "banking-9f22a24d", "reserve-liquidity-no-cb", g, frames, 59, s => { const r = s.creditBooks[0].receipts.at(-1)!; assert.equal(r.reason, "RESERVES"); assert.equal(s.creditBooks[0].movements.length, 0); return { lastReceipt: r.reason, created: "0" }; });
    }
    {
        const g = F.bankingFixture();
        const frames = build(g, 59, { banking: true }, f => { if (f.tick === 0) f.banking = F.bankFrame(0, [{ id: "open", actor: "alice", kind: "OPEN", depositId: "b", bankId: "bankB", product: "SIGHT" }, { id: "deposit", actor: "alice", kind: "DEPOSIT", depositId: "b", amount: F.usd(5000000) }]); });
        await scenario(out, "banking-9f22a24d", "spec-reserve-gap", g, frames, 59, s => { const m = s.bankingMeta!; assert.equal(m.interbank.length, 0); const gap = m.hours[0].gaps.find(x => x.bankId === "bankB")!.gap; assert.equal(gap, micro(4925000)); return { gap: String(gap) }; });
    }
    for (const [name, banks, market] of [["interbank-fear-freeze", ["bankB"], F.bankMarket(10000, 0, 1000000)], ["weighted-interbank-fixing", ["bankB", "bankC"], F.bankMarket(10000)]] as const) {
        const g = F.bankingFixture(); g.ledger.banks.find(b => b.id === "bankB")!.reserves = F.usd(50000); if (banks.length === 2) { g.ledger.banks.find(b => b.id === "bankC")!.reserves = F.usd(50000); (g.banking as { banks: { id: string; enabled: boolean }[] }).banks.find(b => b.id === "bankC")!.enabled = true; }
        g.credit = banks.map(b => F.creditBook(b, [b === "bankB" ? "company-b" : "company-c"], "other"));
        const frames = build(g, 719, { banking: true, credit: [...banks], creditFacts: bigCompany }, f => { if (f.banking) (f.banking as { market: unknown }).market = structuredClone(market); for (const b of banks) { if (f.tick === 0) creditAt(f, b, [F.apply("company", 100000000, b === "bankB" ? "company-b" : "company-c", F.term("BULLET", 28))], bigCompany("", 0)); if (f.tick === 1) creditAt(f, b, [F.accept("company")], bigCompany("", 0)); } });
        await scenario(out, "banking-9f22a24d", name, g, frames, 719, s => { const m = s.bankingMeta!; if (name === "interbank-fear-freeze") { assert.equal(m.interbank.length, 0); assert.equal(m.hours.length, 24); return { interbank: 0, hours: 24 }; } assert.equal(m.fixings[0].ratePpm, 2500); assert.equal(m.fixings[0].fallback, false); assert(s.notes.some(n => n.instrument === "INTERBANK")); return { fixing: m.fixings[0].ratePpm, fallback: false, interbankNotes: s.notes.filter(n => n.instrument === "INTERBANK").length }; });
    }
    // ---- sys/credit 1d1b2770 scenarios
    const C = (t: number, cmds: unknown[], facts: unknown = F.creditFacts(F.creditProfiles())) => (f: F.Frame) => { if (f.tick === t) creditAt(f, "bank", cmds, facts); };
    const all = (...e: ((f: F.Frame) => void)[]) => (f: F.Frame) => e.forEach(x => x(f));
    const book = (s: CoreState) => s.creditBooks[0], bal = (s: CoreState, id: string) => s.accounts.find(a => a.id === id)!.lots.reduce((n, l) => n + l.amount, Z);
    const defaultEdits = [C(0, [F.apply("company", 364, "company-home", F.term("LINEAR", 1))]), C(1, [F.accept("company")]), C(2, [{ id: "expense", actor: "company", kind: "EXPENSE", supplierId: "supplier", amount: F.usd(364) }])];
    {
        const g = F.creditFixture();
        const frames = build(g, 2882, { credit: ["bank"] }, all(...defaultEdits, C(20, [F.apply("person", 50, "person-home", { product: "PERSONAL_LINE" }, "expiry")]), C(2881, [{ id: "refund", actor: "supplier", kind: "REFUND_EXPENSE", expenseId: "expense", amount: F.usd(100) }, { id: "repay", actor: "company", kind: "REPAY", loanId: F.offerId(), amount: F.usd(100) }])));
        await scenario(out, "credit-1d1b2770", "default", g, frames, 2882, s => { const l = book(s).loans[0]; assert.equal(l.status, "CHARGED_OFF"); return { status: l.status, writtenOff: String(book(s).writtenOff), supplier: String(bal(s, "supplier-home")) }; }, { points: [50, 2879, 2880, 2881] });
        const witness = await BankingCoreEngine.open(new FileBankingCoreStore(join(out, "credit-1d1b2770-loss-witness.json")), g, true);
        let s = await witness.advance(2879, frames.filter(f => f.tick <= 2879 && f.tick !== 20));
        assert.equal(book(s).loans[0].status, "DEFAULTED"); assert.equal(book(s).writtenOff, Z);
        s = await witness.advance(2880, []);
        assert.equal(book(s).loans[0].status, "CHARGED_OFF"); assert.equal(book(s).writtenOff, micro(364));
        const sheet = witness.sheets()[0];
        assert.equal(sheet.equity, -micro(264)); assert.equal(bal(s, "supplier-home"), micro(364));
        reports.push({ source: "credit-1d1b2770", name: "default-before-recovery", bankEquity: String(sheet.equity), depositorMoneyErased: "0", supplierRetained: F.usd(364), audit: summary(independent(g, s, ["bank"])) });
        console.log("PASS credit loss-witness");
    }
    for (const amortization of ["LINEAR", "ANNUITY", "BULLET"]) {
        const g = F.creditFixture(10000), target = 364 * 720 - 1;
        const frames = build(g, target, { credit: ["bank"] }, all(C(0, [F.apply("company", 364, "company-home", F.term(amortization, 28))]), C(1, [F.accept("company")])));
        await scenario(out, "credit-1d1b2770", amortization.toLowerCase(), g, frames, target, s => { const l = book(s).loans[0]; assert.equal(l.status, "REPAID"); assert.equal(s.assets.find(a => a.id === l.assetId)!.holdings.reduce((n, h) => n + h.quantity, Z), Z); return { status: l.status, income: String(book(s).income) }; }, { exact: ["bank"] });
    }
    {
        const g = F.creditFixture(), target = 35 * 720 - 1;
        const facts = (_: string, d: number) => { const p = F.creditProfiles(); if (d >= 27) (p[0] as { held: boolean }).held = true; return F.creditFacts(p); };
        const frames = build(g, target, { credit: ["bank"], creditFacts: facts }, all(C(0, [F.apply("person", 1000, "person-home", { product: "PERSONAL_LINE" })]), C(1, [F.accept("person")]), C(2, [{ id: "draw", actor: "person", kind: "DRAW", loanId: F.offerId(), amount: F.usd(100) }])));
        await scenario(out, "credit-1d1b2770", "retail-review", g, frames, target, s => ({ status: book(s).loans[0].status, events: book(s).events.map(e => e.kind) }), { exact: ["bank"] });
    }
    {
        const g = F.creditFixture(10000), target = 120 * 720 - 1;
        const facts = (_: string, d: number) => { const p = F.creditProfiles(); if (d < 119) (p[1] as { outsideDebt: string }).outsideDebt = F.usd(46000); return F.creditFacts(p); };
        const frames = build(g, target, { credit: ["bank"], creditFacts: facts }, all(C(0, [F.apply("company", 364, "company-home", F.term("BULLET", 28))]), C(1, [F.accept("company")])));
        await scenario(out, "credit-1d1b2770", "covenant", g, frames, target, s => ({ status: book(s).loans[0].status, events: [...new Set(book(s).events.map(e => e.kind))] }), { exact: ["bank"] });
    }
    // ---- sys/bank-liquidity ce66e618 scenarios
    const L = (ledger: F.Ledger): Fx => ({ ledger, liquidityEnabled: true, banking: null, credit: [], ccp: null });
    const liq = async (name: string, g: Fx, target: number, tool: string | null, edit: (f: F.Frame) => void, literal = false) => {
        const frames = build(g, target, { liquidity: true }, edit);
        await scenario(out, "bank-liquidity-ce66e618", name, g, frames, target, s => { const b = s.banks[0]; assert.equal(b.resolution?.tool ?? null, tool); if (tool && tool !== "LIQUIDATION") assert.equal(b.resolution!.insuranceShortfall, Z); return { tool, status: b.status, losses: b.resolution?.creditorLosses ?? [], insuranceShortfall: String(b.resolution?.insuranceShortfall ?? Z) }; }, { literal, points: [719, 749, 1439] });
    };
    const cmd = (t: number, c: unknown[]) => (f: F.Frame) => { if (f.tick === t) (f.liquidity as { commands: unknown[] }).commands = c; };
    const fact = (t: number, e: (x: ReturnType<typeof F.liquidityFacts>) => void) => (f: F.Frame) => { if (f.tick === t) e((f.liquidity as { facts: ReturnType<typeof F.liquidityFacts> }).facts); };
    { const l = F.liquidityLedger(); await liq("literal-reserve-transfers", L(l), 90, null, cmd(0, [F.ownMove("bank-move", "alice-a", "alice-b", 10000)]), true); }
    { const l = F.liquidityLedger(); await liq("funded-acquisition", L(l), 1499, "PA", all(fact(719, x => { x.banks[0].regulatorFailure = true; }), cmd(720, [{ id: "acquisition", actor: "owner-b", kind: "BID", bankId: "a", buyerBankId: "b", price: F.usd(1000), capitalInjection: F.usd(10000) }]))); }
    { const l = F.liquidityLedger(); l.assets[0].markPpm = 600000; l.notes = ["AT1", "SUB", "SENIOR"].map(rank => ({ id: rank.toLowerCase(), bankId: "a", creditor: "creditor", rank: rank as "AT1", instrument: "BOND" as const, amount: F.usd(30000), longTerm: true })); await liq("loss-bearing-bailin", L(l), 800, "BAIL_IN", () => undefined); }
    {
        const l = F.liquidityLedger(); Object.assign(l.assets[0], { kind: "L1", rwPpm: 0, collateralFor: "secured" }); l.banks[0].reserves = F.usd(50000); l.dgf[0].cash = "0";
        l.notes = [["secured", "SECURED", "OTHER", 200000, false], ["cost", "COST", "OTHER", 10000, false], ["senior", "SENIOR", "BOND", 100000, true], ["sub", "SUB", "BOND", 100000, true], ["at1", "AT1", "BOND", 100000, true]].map(([id, rank, instrument, n, longTerm]) => ({ id: id as string, bankId: "a", creditor: "creditor", rank: rank as "SECURED", instrument: instrument as "OTHER", amount: F.usd(n as number), longTerm: longTerm as boolean }));
        await liq("secured-waterfall", L(l), 1499, "LIQUIDATION", all(cmd(0, [F.ownMove("real-reserve-gap", "alice-a", "alice-b", 400000)]), fact(719, x => { x.banks[0].regulatorFailure = true; }), fact(750, x => { x.bids = [{ id: "finite-estate-buyer", buyer: { kind: "ACCOUNT", id: "dealer" }, assetId: "loans", quantity: F.usd(1500000), pricePpm: 970000 }] as never; })));
    }
    { const l = F.liquidityLedger(); l.dgf[0].cash = F.usd(100); await liq("no-buyer-no-rescue", L(l), 719 + 14 * 720, "LIQUIDATION", cmd(0, [F.ownMove("unfunded-run", "alice-a", "alice-b", 400000)])); }
    // ---- sys/margin-ccp 8c5a7054 scenarios: CCP cash is custody accounts in the same ledger
    const ccp = async (name: string, count: number, two: boolean, target: number, edit: (f: F.Frame, ids: string[]) => void, inspect: (s: CoreState) => Record<string, unknown>, literal = false) => {
        const c = F.ccpFixture(count, two), g: Fx = { ledger: F.ledger([F.bank("custodian", "0")], c.accounts), liquidityEnabled: false, banking: null, credit: [], ccp: c.ccp };
        const frames = build(g, target, { ccp: { ids: c.ids, services: c.services } }, f => edit(f, c.ids));
        await scenario(out, "margin-ccp-8c5a7054", name, g, frames, target, s => { for (const e of s.ccpMeta!.defaults) assert(e.remaining >= Z); return inspect(s); }, { literal, points: [0, 1, 120, 240, 360, 479, 480, 719, 720, 721, 722, 5759, 5760, 5761, 9359, 9360].filter(t => t <= target) });
    };
    const dflt = (loss: number) => (f: F.Frame, ids: string[]) => { if (f.tick === 0) cf(f).facts.defaults = [{ memberId: "d", service: "LD", reason: "REGULATOR" }]; if (f.tick === 480) cf(f).facts.closeouts = [F.closeout(ids, loss)]; };
    await ccp("margin-next-tick-plans", 4, false, 40, (f) => { const r = cf(f).facts.risks[0]; if (f.tick < 2) { r.im = F.usd(140); if (f.tick === 0) cf(f).commands = [{ id: "fund", actor: "owner-d", kind: "POST_MARGIN", memberId: "d", service: "LD", amount: F.usd(40) }]; } else { r.im = F.usd(300); r.positions = [{ assetId: "listed-future", quantity: f.tick < 5 ? "100" : "80", fairValue: F.usd(100), marginalIm: F.usd(300), expectedCost: F.usd(1), sigmaPpm: 100, expectedTickVolume: "100", marketOpen: f.tick !== 3, opening: f.tick === 4, openingVolume: "50" }]; } }, s => ({ margins: s.ccpMeta!.margins.length, transfers: s.ccpMeta!.transfers.length }), true);
    await ccp("funded-waterfall", 4, false, 800, (f, ids) => { dflt(800)(f, ids); if (f.tick === 721) for (const m of ids.filter(m => m !== "d")) for (const kind of ["assessment", "df"]) cf(f).commands.push({ id: "pay-" + m + "-" + kind, actor: "owner-" + m, kind: "PAY_CALL", callId: "LD/d/0/" + kind + "/" + m, amount: F.usd(100) }); }, s => { const e = s.ccpMeta!.defaults[0]; assert.equal(e.remaining, Z); assert.equal(sum(e.layers.map(l => l.amount)), micro(800)); assert.equal(e.layers.at(-1)!.layer, "ASSESSMENT"); assert.equal(s.ccpMeta!.services[0].status, "RECOVERY"); return { remaining: "0", lastLayer: "ASSESSMENT", status: "RECOVERY" }; });
    await ccp("funded-net-vmgh", 4, false, 5760, (f, ids) => { dflt(630)(f, ids); if (f.tick === 5760) cf(f).facts.vm = [{ service: "LD", fromMemberId: "s1", toMemberId: "s2", amount: F.usd(100) }, { service: "LD", fromMemberId: "s2", toMemberId: "s1", amount: F.usd(40) }, { service: "LD", fromMemberId: "s1", toMemberId: "s3", amount: F.usd(30) }]; }, s => { const e = s.ccpMeta!.defaults[0]; assert.equal(e.remaining, Z); assert.equal(s.ccpMeta!.services[0].status, "RECOVERY"); assert.equal(e.layers.at(-1)!.layer, "VMGH"); assert.equal(e.layers.at(-1)!.amount, micro(50)); return { remaining: "0", lastLayer: "VMGH", amount: F.usd(50) }; });
    await ccp("exhausted-no-rescue", 4, true, 9360, dflt(1000), s => { const e = s.ccpMeta!.defaults[0]; assert.equal(e.remaining, micro(420)); assert.equal(e.stage, "SHORTFALL"); assert.equal(s.ccpMeta!.services.find(x => x.id === "LD")!.status, "CLOSED"); assert.equal(s.ccpMeta!.services.find(x => x.id === "OTC")!.status, "OPEN"); for (const id of ["d", "s1", "s2", "s3"]) assert.equal(bal(s, "df/OTC/" + id), micro(100)); return { remaining: F.usd(420), stage: "SHORTFALL" }; });
    await ccp("overlapping-defaults", 7, false, 800, (f, ids) => { if (f.tick === 0) cf(f).facts.defaults = ["d", "s1", "s2"].map(memberId => ({ memberId, service: "LD", reason: "REGULATOR" })); if (f.tick === 480) cf(f).facts.closeouts = ["d", "s1", "s2"].map(memberId => ({ defaultId: "LD/" + memberId + "/0", sourceId: "closeout-" + memberId, loss: F.usd(10000), claims: [{ memberId: "s6", amount: F.usd(10000) }], scores: ids.filter(m => m !== memberId).map((m, i) => ({ memberId: m, distance: F.usd(100 - i) })) })); }, s => { for (const id of ["s3", "s4", "s5", "s6"]) assert.equal(sum(s.ccpMeta!.assessmentHistory.filter(h => h.memberId === id).map(h => h.amount)), micro(200)); return { assessedEach: F.usd(200) }; });
    // ---- cross-module: loan -> deposit run -> bank failure with bail-in -> CCP member default at that bank
    {
        const c = F.ccpFixture(4, false, "a"), ledger = F.ledger([F.bank("a", F.usd(3500000)), F.bank("b", F.usd(2000000), true)], [F.account("alice-a", "a", "alice", F.usd(300000)), F.account("alice-b", "b", "alice", "0"), F.account("corp-a", "a", "company", "0", "CORPORATE"), F.account("treasury-a", "a", "treasury", F.usd(3000000), "CORPORATE"), F.account("supplier-b", "b", "supplier", "0", "CORPORATE"), ...c.accounts], F.usd(500000));
        const g: Fx = { ledger, liquidityEnabled: true, banking: null, credit: [{ bank: F.creditPolicy("a", 10000000), clients: [{ id: "company", kind: "COMPANY", homeAccountId: "corp-a", accountIds: ["corp-a"] }], supplierAccountId: "supplier-b" }], ccp: c.ccp };
        const facts = () => F.creditFacts([F.companyProfile("company", 20000000)]);
        const o: Opts = { credit: ["a"], liquidity: true, ccp: { ids: c.ids, services: c.services }, creditFacts: () => facts() };
        const plan = (failedAt: number | null) => build(g, 5040, o, f => {
            if (f.tick === 0) creditAt(f, "a", [F.apply("company", 1000000, "corp-a", F.term("LINEAR", 1))], facts());
            if (f.tick === 1) creditAt(f, "a", [F.accept("company")], facts());
            if (f.tick === 2) creditAt(f, "a", [{ id: "spend", actor: "company", kind: "EXPENSE", supplierId: "supplier", amount: F.usd(1000000) }], facts());
            if (f.tick === 30) (f.liquidity as { commands: unknown[] }).commands = [F.ownMove("run", "alice-a", "alice-b", 300000)];
            if (failedAt !== null && f.tick === failedAt + 481) cf(f).facts.closeouts = [F.closeout(c.ids, 150, "d", failedAt + 1)];
        });
        const probe = await BankingCoreEngine.open(new FileBankingCoreStore(join(out, "cross-module-plan.json")), g, true);
        const failedAt = (await probe.advance(5040, plan(null))).banks[0].failedAt;
        assert(failedAt !== null, "bank a must fail in the cross-module scenario");
        await scenario(out, "cross-module", "loan-run-bailin-ccp-default", g, plan(failedAt), 5040, s => {
            const a = s.banks[0], l = s.creditBooks[0].loans[0], e = s.ccpMeta!.defaults.find(x => x.memberId === "d")!;
            assert(s.creditBooks[0].movements.some(m => m.kind === "CREDIT_CREATE")); assert.equal(l.status, "CHARGED_OFF");
            assert.equal(a.resolution!.tool, "BAIL_IN"); assert(a.resolution!.equityRights.some(r => r.creditor === "treasury-a"));
            assert.equal(e.reason ?? "BANK_RESOLUTION", "BANK_RESOLUTION"); assert(e.closeout);
            return { failedAt, tool: a.resolution!.tool, status: a.status, equityRights: a.resolution!.equityRights, loan: l.status, ccpDefault: { id: e.id, stage: e.stage, remaining: String(e.remaining), layers: e.layers } };
        }, { exact: ["a", "b"], points: [0, 1, 2, 29, 30, 31, failedAt, failedAt + 30, failedAt + 1, failedAt + 481, failedAt + 482] });
    }
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "";
    await writeFile(join(out, "RESULT.json"), wire({ head, dirty, started, finished: new Date().toISOString(), zone: "report converts to Europe/Paris", pass: true, scenarios: reports.length, results: reports }) + "\n");
    console.log("ALL PASS", reports.length);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

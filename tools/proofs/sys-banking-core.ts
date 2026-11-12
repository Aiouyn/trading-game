import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { BankingCoreEngine } from "../../src/server/banking-core/engine";
import { independent, auditSummary as summary, type AuditGenesis } from "./banking-core-audit";
import { coreWire } from "../../src/server/banking-core/boundary";
import type { CoreState } from "../../src/server/banking-core/model";
import { FileBankingCoreStore } from "../../src/server/banking-core/store";
import * as F from "../../tests/unit/banking-core/fixture";

type Fx = F.CoreFixture;
type Opts = { banking?: boolean; credit?: string[]; liquidity?: boolean; ccp?: { ids: string[]; services: string[] } | null; creditFacts?: (bankId: string, day: number) => unknown };
const Z = BigInt(0), sum = (v: Iterable<bigint>) => [...v].reduce((a, b) => a + b, Z);
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


type CF = { facts: { risks: { im: string; positions: unknown[] }[]; defaults: unknown[]; closeouts: unknown[]; vm: unknown[] }; commands: unknown[] };
const cf = (f: F.Frame) => f.ccp as CF;
const reports: unknown[] = [];
const CLOSEOUT_DELAY = 481;
let crossModule: Record<string, unknown> = {};
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
    const audit = independent(g as unknown as AuditGenesis, s, opt.exact), checks = inspect(s, jump);
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
        const edit = (failedAt: number | null) => (f: F.Frame) => {
            if (f.tick === 0) creditAt(f, "a", [F.apply("company", 1000000, "corp-a", F.term("LINEAR", 1))], facts());
            if (f.tick === 1) creditAt(f, "a", [F.accept("company")], facts());
            if (f.tick === 2) creditAt(f, "a", [{ id: "spend", actor: "company", kind: "EXPENSE", supplierId: "supplier", amount: F.usd(1000000) }], facts());
            if (f.tick === 30) (f.liquidity as { commands: unknown[] }).commands = [F.ownMove("run", "alice-a", "alice-b", 300000)];
            if (failedAt !== null && f.tick === failedAt + CLOSEOUT_DELAY) cf(f).facts.closeouts = [F.closeout(c.ids, 150, "d", failedAt + 1)];
        };
        // One causal pass, no planning pass: the closeout producer only sees committed engine state. It advances in chunks
        // shorter than the closeout delay, so the failure is always observed before the closeout tick is emitted.
        const TARGET = 5040, CHUNK = 480, driver = await BankingCoreEngine.open(new FileBankingCoreStore(join(out, "cross-module-single-pass.json")), g, true);
        let failedAt: number | null = null, observedAt: number | null = null, prev = -1;
        const emitted: F.Frame[] = [], failures: { failedAt: number; observedAtTick: number }[] = [];
        while (prev < TARGET) {
            const end = Math.min(prev + CHUNK, TARGET), rows = build(g, end, o, edit(failedAt)).filter(f => f.tick > prev);
            await driver.advance(end, rows);
            emitted.push(...rows);
            const seen = driver.snapshot().banks.find(b => b.id === "a")!.failedAt;
            if (failedAt === null && seen !== null) { failedAt = seen; observedAt = end; assert(failedAt + CLOSEOUT_DELAY > end, "closeout tick must still be in the future when the failure is observed"); }
            // The closeout charges bank a's own CCP custody, so a second solvency failure may follow it; record, never hide it.
            if (seen !== null && seen !== (failures.at(-1)?.failedAt ?? null)) failures.push({ failedAt: seen, observedAtTick: end });
            prev = end;
        }
        assert(failedAt !== null && observedAt !== null, "bank a must fail in the cross-module scenario");
        const frames = emitted, closeoutTicks = frames.filter(f => (f.ccp as CF).facts.closeouts.length).map(f => f.tick);
        assert.deepEqual(closeoutTicks, [failedAt + CLOSEOUT_DELAY]);
        // The causal frames equal the old two-pass placement rule applied to the observed failure tick.
        assert.equal(wire(frames), wire(build(g, TARGET, o, edit(failedAt))), "single-pass frames equal the placement rule");
        for (const later of failures.slice(1)) assert(later.failedAt > failedAt + CLOSEOUT_DELAY, "a later failure can only follow the closeout");
        // 07 ring-fence (unit doc "Decision: the post-closeout second failure"): the bank's own CCP close-out is never a second hit.
        assert.deepEqual(failures.map(x => x.failedAt), [failedAt], "exactly one resolution of bank a");
        crossModule = { chunk: CHUNK, chunks: Math.ceil((TARGET + 1) / CHUNK), firstFailedAt: failedAt, observedAtTick: observedAt, closeoutTick: failedAt + CLOSEOUT_DELAY, failures, framesSha256: sha(wire(frames)), planningPass: false };
        const fa = failedAt;
        await scenario(out, "cross-module", "loan-run-bailin-ccp-default", g, frames, TARGET, s => {
            const a = s.banks[0], l = s.creditBooks[0].loans[0], e = s.ccpMeta!.defaults.find(x => x.memberId === "d")!;
            assert(s.creditBooks[0].movements.some(m => m.kind === "CREDIT_CREATE")); assert.equal(l.status, "CHARGED_OFF");
            assert.equal(a.resolution!.tool, "BAIL_IN"); assert(a.resolution!.equityRights.some(r => r.creditor === "treasury-a"));
            assert.equal(e.reason ?? "BANK_RESOLUTION", "BANK_RESOLUTION"); assert(e.closeout);
            assert.equal(a.failedAt, failures.at(-1)!.failedAt); assert.equal(s.ccpMeta!.defaults.filter(x => x.memberId === "d").length, 1, "one CCP default even if the bank fails again");
            return { failedAt: fa, finalFailedAt: a.failedAt, failures: structuredClone(failures), ccpDefaults: s.ccpMeta!.defaults.length, tool: a.resolution!.tool, status: a.status, equityRights: a.resolution!.equityRights, loan: l.status, ccpDefault: { id: e.id, stage: e.stage, remaining: String(e.remaining), layers: e.layers } };
        }, { exact: ["a", "b"], points: [0, 1, 2, 29, 30, 31, fa, fa + 30, fa + 1, fa + CLOSEOUT_DELAY, fa + CLOSEOUT_DELAY + 1] });
        const single = await readFile(join(out, "cross-module-single-pass.json"), "utf8"), jumpBytes = await readFile(join(out, "cross-module-loan-run-bailin-ccp-default", "jump.json"), "utf8");
        assert.equal(single, jumpBytes, "chunked causal store equals the jump store byte for byte");
        crossModule.singlePassStoreEqualsJump = true; crossModule.checkpointSha256 = sha(single);
        await writeFile(join(out, "CROSS-MODULE-SINGLE-PASS.json"), wire(crossModule) + "\n");
    }
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "";
    await writeFile(join(out, "RESULT.json"), wire({ head, dirty, started, finished: new Date().toISOString(), zone: "report converts to Europe/Paris", pass: true, scenarios: reports.length, crossModule, results: reports }) + "\n");
    console.log("ALL PASS", reports.length);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

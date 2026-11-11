import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { CreditEngine } from "../../src/server/credit/engine";
import { canonicalJson, creditWire } from "../../src/server/credit/input";
import type { CreditState } from "../../src/server/credit/model";
import { FileCreditCheckpointStore } from "../../src/server/credit/store";
import { accept, apply, days, defaultFrames, facts, frame, genesis, offerId, repay, usd } from "../../tests/unit/credit/fixtures";
type RawGenesis = ReturnType<typeof genesis>;
type RawFrame = ReturnType<typeof frame>;
const ZERO = BigInt(0), micro = (n: number) => BigInt(usd(n));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const account = (clientId: string, accountId: string) => "account:" + hash(JSON.stringify({ accountId, clientId }));
function audit(g: RawGenesis, s: CreditState) {
    const actual = new Map<string, bigint>();
    for (const c of s.clients)
        for (const a of c.accounts)
            actual.set(account(c.id, a.id), a.cash);
    actual.set("supplier:" + s.supplier.id, s.supplier.cash);
    const reconstructed = new Map([...actual.keys()].map(k => [k, ZERO]));
    for (const c of g.clients)
        for (const a of c.accounts)
            reconstructed.set(account(c.id, a.id), BigInt(a.cash));
    reconstructed.set("supplier:" + g.supplier.id, BigInt(g.supplier.cash));
    const sum = (a: Iterable<bigint>) => [...a].reduce((n, v) => n + v, ZERO), opening = sum(reconstructed.values()), physicalReserves = opening + BigInt(g.bank.initialCapital);
    const principal = new Map<string, bigint>(), writtenOff = new Map<string, bigint>();
    let created = ZERO, destroyed = ZERO, income = ZERO;
    const ticks = [...new Set([...s.movements.map(m => m.tick), ...s.events.filter(e => e.kind === "LOAN_CHARGED_OFF").map(e => e.tick)])].sort((a, b) => a - b);
    for (const tick of ticks) {
        for (const m of s.movements.filter(m => m.tick === tick)) {
            assert(m.amount > ZERO);
            if (m.kind === "CREDIT_CREATE") {
                assert.equal(m.from, "bank:loan-asset");
                assert(m.loanId !== null && s.loans.some(l => l.id === m.loanId));
                assert(reconstructed.has(m.to));
                reconstructed.set(m.to, reconstructed.get(m.to)! + m.amount);
                created += m.amount;
                principal.set(m.loanId, (principal.get(m.loanId) ?? ZERO) + m.amount);
            }
            else {
                assert(reconstructed.has(m.from));
                assert(reconstructed.get(m.from)! >= m.amount);
                reconstructed.set(m.from, reconstructed.get(m.from)! - m.amount);
                if (m.to === "bank:destroy-principal") {
                    assert.equal(m.kind, "REPAY_PRINCIPAL");
                    assert(m.loanId !== null);
                    assert((principal.get(m.loanId) ?? ZERO) >= m.amount);
                    principal.set(m.loanId, principal.get(m.loanId)! - m.amount);
                    destroyed += m.amount;
                    const loss = writtenOff.get(m.loanId) ?? ZERO;
                    writtenOff.set(m.loanId, loss - (m.amount < loss ? m.amount : loss));
                }
                else if (m.to === "bank:income") {
                    assert(["REPAY_FEE", "REPAY_PENALTY", "REPAY_INTEREST"].includes(m.kind));
                    assert(m.loanId !== null);
                    income += m.amount;
                }
                else {
                    assert(["EXPENSE", "REFUND", "ROUTE"].includes(m.kind));
                    assert(reconstructed.has(m.to));
                    reconstructed.set(m.to, reconstructed.get(m.to)! + m.amount);
                }
            }
            assert.equal(sum(reconstructed.values()), opening + created - destroyed - income);
        }
        for (const e of s.events.filter(e => e.tick === tick && e.kind === "LOAN_CHARGED_OFF")) {
            assert.equal(e.amount, principal.get(e.loanId) ?? ZERO);
            writtenOff.set(e.loanId, e.amount);
        }
        const net = sum(principal.values()) - sum(writtenOff.values()), equity = BigInt(g.bank.initialCapital) + income - sum(writtenOff.values());
        assert.equal(sum(reconstructed.values()) + equity, physicalReserves + net);
    }
    assert.deepEqual(reconstructed, actual);
    for (const l of s.loans) {
        assert.equal(l.principal, principal.get(l.id) ?? ZERO);
        assert.equal(l.chargedOff, writtenOff.get(l.id) ?? ZERO);
        assert(l.undrawn >= ZERO);
    }
    assert.equal(s.bankBook.reserves, physicalReserves);
    assert.equal(s.bankBook.income, income);
    assert.equal(s.bankBook.writtenOff, sum(writtenOff.values()));
    assert.equal(s.bankBook.equity, BigInt(g.bank.initialCapital) + income - sum(writtenOff.values()));
    const netLoans = sum(principal.values()) - sum(writtenOff.values()), deposits = sum(actual.values()), netReserves = physicalReserves - s.bankBook.equity;
    assert.equal(deposits, netLoans + netReserves);
    return { depositsMicro: deposits.toString(), openingReserveBackedDepositsMicro: opening.toString(), createdByLoanMicro: created.toString(), destroyedPrincipalMicro: destroyed.toString(), paidBankIncomeMicro: income.toString(), unexplainedCreationMicro: "0", grossLoansMicro: sum(principal.values()).toString(), netLoanAssetsMicro: netLoans.toString(), physicalReservesMicro: physicalReserves.toString(), equityMicro: s.bankBook.equity.toString(), reservesNetOfEquityMicro: netReserves.toString(), writeOffMicro: sum(writtenOff.values()).toString(), balanceSheetResidualMicro: "0", movements: s.movements.length };
}
async function run(out: string, label: string, g: RawGenesis, input: RawFrame[], target: number, literal = false) {
    const states: CreditState[] = [], bytes: string[] = [], results = [];
    for (const mode of ["jump", "event-day", "restart", ...(literal ? ["every-tick"] : [])]) {
        const path = join(out, label + "-" + mode + ".json"), store = new FileCreditCheckpointStore(path);
        let engine = await CreditEngine.open(store, g), previous = -1;
        const milestones = mode === "jump" ? [target] : mode === "every-tick" ? Array.from({ length: target + 1 }, (_, i) => i) : [...new Set([...input.map(f => f.tick), ...(label === "default" ? [50, 2880] : []), target])].sort((a, b) => a - b);
        for (const tick of milestones) {
            const frames = input.filter(f => f.tick > previous && f.tick <= tick);
            await engine.advance(tick, frames);
            previous = tick;
            audit(g, engine.snapshot());
            if (mode === "restart" && (tick % 720 === 719 || tick < 51 || tick === 2880))
                engine = await CreditEngine.open(new FileCreditCheckpointStore(path), g);
        }
        const state = engine.snapshot(), checkpoint = await readFile(path, "utf8");
        assert.deepEqual((await CreditEngine.open(new FileCreditCheckpointStore(path), g)).snapshot(), state);
        states.push(state);
        bytes.push(checkpoint);
        results.push({ mode, steps: milestones.length, path, checkpointSha256: hash(checkpoint), ...audit(g, state) });
    }
    for (let i = 1; i < states.length; i++) {
        assert.deepEqual(states[i], states[0]);
        assert.equal(bytes[i], bytes[0]);
    }
    await writeFile(join(out, label + "-state.json"), canonicalJson(creditWire(states[0])) + "\n");
    return { label, equivalent: true, results };
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--out" || !isAbsolute(args[1]))
        throw new Error("Usage: npx tsx tools/proofs/sys-credit.ts --out /absolute/new-directory");
    const out = args[1];
    await mkdir(out);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), report: {
        head: string;
        zone: string;
        timestamp: string;
        scenarios: unknown[];
        status?: string;
    } = { head, zone: "Europe/Paris", timestamp: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "long" }).format(new Date()), scenarios: [] };
    const save = () => writeFile(join(out, "RESULT.json"), JSON.stringify(report, null, 2) + "\n");
    await save();
    const defaultInput = defaultFrames();
    defaultInput.splice(3, 0, frame(20, [apply("person", 50, "LINEAR", 28, "expiry")]));
    defaultInput.push(frame(2881, [{ id: "refund", actor: "supplier", kind: "REFUND_EXPENSE", expenseId: "expense", amount: usd(100) }, repay("company", 100)]));
    report.scenarios.push(await run(out, "default", genesis(), defaultInput, 2882, true));
    await save();
    const witness = await CreditEngine.open(new FileCreditCheckpointStore(join(out, "loss-witness.json")), genesis());
    let s = await witness.advance(2879, defaultFrames());
    assert.equal(s.loans[0].status, "DEFAULTED");
    assert.equal(s.bankBook.writtenOff, ZERO);
    s = await witness.advance(2880, []);
    assert.equal(s.loans[0].status, "CHARGED_OFF");
    assert.equal(s.bankBook.writtenOff, micro(364));
    assert.equal(s.bankBook.equity, -micro(264));
    assert.equal(s.supplier.cash, micro(364));
    report.scenarios.push({ label: "default-before-recovery", ...audit(genesis(), s), bankEquityLossMicro: usd(364), depositorMoneyErasedMicro: "0", supplierRetainedMicro: usd(364) });
    await save();
    for (const amortization of ["LINEAR", "ANNUITY", "BULLET"]) {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(10000);
        report.scenarios.push(await run(out, amortization.toLowerCase(), g, [frame(0, [apply("company", 364, amortization)]), frame(1, [accept()]), ...days(364)], 364 * 720 - 1));
        await save();
    }
    const retail = [frame(0, [apply("person", 1000)]), frame(1, [accept("person")]), frame(2, [{ id: "draw", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(100) }]), ...days(35, d => {
            const f = facts();
            if (d >= 27)
                f.profiles[0].held = true;
            return f;
        })];
    report.scenarios.push(await run(out, "retail-review", genesis(), retail, 35 * 720 - 1));
    await save();
    const g = genesis();
    g.clients[1].accounts[0].cash = usd(10000);
    report.scenarios.push(await run(out, "covenant", g, [frame(0, [apply("company", 364, "BULLET")]), frame(1, [accept()]), ...days(120, d => {
            const f = facts();
            if (d < 119)
                f.profiles[1].outsideDebt = usd(46000);
            return f;
        })], 120 * 720 - 1));
    report.status = "PASS";
    await save();
    console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

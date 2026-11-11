import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { CreditEngine } from "../../src/server/credit/engine";
import { canonicalJson, creditWire } from "../../src/server/credit/input";
import type { CreditState } from "../../src/server/credit/model";
import { FileCreditCheckpointStore } from "../../src/server/credit/store";
import { accept, apply, days, defaultFrames, facts, frame, fund, genesis, offerId, repay, usd } from "../../tests/unit/credit/fixtures";
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
    for (const f of s.funds)
        actual.set("fund:" + f.id, f.cash);
    actual.set("supplier:" + s.supplier.id, s.supplier.cash);
    const reconstructed = new Map([...actual.keys()].map(k => [k, ZERO]));
    for (const c of g.clients)
        for (const a of c.accounts)
            reconstructed.set(account(c.id, a.id), BigInt(a.cash));
    const capital = s.funds.filter(f => f.depositorId === null);
    assert.equal(capital.length, 1);
    reconstructed.set("fund:" + capital[0].id, BigInt(g.bank.initialCapital));
    reconstructed.set("supplier:" + g.supplier.id, BigInt(g.supplier.cash));
    const sum = (values: Iterable<bigint>) => [...values].reduce((a, b) => a + b, ZERO), budget = sum(reconstructed.values());
    for (const m of s.movements) {
        assert(m.amount > ZERO);
        assert(reconstructed.has(m.from) && reconstructed.has(m.to));
        assert((reconstructed.get(m.from) ?? ZERO) >= m.amount);
        reconstructed.set(m.from, reconstructed.get(m.from)! - m.amount);
        reconstructed.set(m.to, reconstructed.get(m.to)! + m.amount);
        assert.equal(sum(reconstructed.values()), budget);
    }
    assert.deepEqual(reconstructed, actual);
    let reserved = ZERO, principal = ZERO, loss = ZERO;
    for (const f of s.funds) {
        const held = s.offers.filter(o => o.status === "OPEN").flatMap(o => o.slices).filter(a => a.fundId === f.id).reduce((n, a) => n + a.amount, ZERO) + s.loans.flatMap(l => l.slices).filter(a => a.fundId === f.id).reduce((n, a) => n + a.reserved, ZERO);
        assert(f.cash >= held);
        reserved += held;
        const shares = s.loans.flatMap(l => l.slices).filter(a => a.fundId === f.id), outstanding = sum(shares.map(a => a.principal));
        const lent = sum(s.movements.filter(m => m.from === "fund:" + f.id && m.kind === "DRAW").map(m => m.amount)), returned = sum(s.movements.filter(m => m.to === "fund:" + f.id && m.kind === "REPAY_PRINCIPAL").map(m => m.amount));
        assert.equal(outstanding, lent - returned);
        assert.equal(f.loss, sum(shares.map(a => a.chargedOff)));
        assert(shares.every(a => a.chargedOff <= a.principal));
        principal += outstanding;
        loss += f.loss;
    }
    return { cashMicro: sum(actual.values()).toString(), initialMicro: budget.toString(), createdMicro: (sum(actual.values()) - budget).toString(), reservedMicro: reserved.toString(), outstandingMicro: principal.toString(), lossMicro: loss.toString(), movements: s.movements.length, buckets: actual.size };
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
    assert.deepEqual(s.funds.map(f => f.loss), [ZERO, ZERO]);
    s = await witness.advance(2880, []);
    assert.equal(s.loans[0].status, "CHARGED_OFF");
    assert.deepEqual(s.funds.map(f => f.loss), [micro(100), micro(264)]);
    assert.equal(s.supplier.cash, micro(364));
    report.scenarios.push({ label: "default-before-recovery", ...audit(genesis(), s), bankLossMicro: usd(100), depositorLossMicro: usd(264), supplierRetainedMicro: usd(364) });
    await save();
    for (const amortization of ["LINEAR", "ANNUITY", "BULLET"]) {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(10000);
        report.scenarios.push(await run(out, amortization.toLowerCase(), g, [frame(0, [fund(), apply("company", 364, amortization)]), frame(1, [accept()]), ...days(364)], 364 * 720 - 1));
        await save();
    }
    const retail = [frame(0, [fund(), apply("person", 1000)]), frame(1, [accept("person")]), frame(2, [{ id: "draw", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(100) }]), ...days(35, d => { const f = facts(); if (d >= 27)
            f.profiles[0].held = true; return f; })];
    report.scenarios.push(await run(out, "retail-review", genesis(), retail, 35 * 720 - 1));
    await save();
    const g = genesis();
    g.clients[1].accounts[0].cash = usd(10000);
    report.scenarios.push(await run(out, "covenant", g, [frame(0, [fund(), apply("company", 364, "BULLET")]), frame(1, [accept()]), ...days(120, d => { const f = facts(); if (d < 119)
            f.profiles[1].outsideDebt = usd(46000); return f; })], 120 * 720 - 1));
    report.status = "PASS";
    await save();
    console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

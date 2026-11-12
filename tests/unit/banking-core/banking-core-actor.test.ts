import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryAuthStore } from "@/server/auth";
import { ActorBinding, BindingError, MemoryBindingStore } from "@/server/actor-binding";
import { authService, register, Clock } from "../actor-binding/fixture";
import {
  BANKING_CORE_ACTOR_DEFAULT_ENABLED,
  BANKING_CORE_DEFAULT_ENABLED,
  BankingCoreEngine,
  FileBankingCoreStore,
  actorGuardEnabled,
  assertCoreAccounting,
} from "../../../src/server/banking-core/engine";
import { coreFingerprint, decodeCoreFrames, decodeCoreGenesis } from "../../../src/server/banking-core/boundary";
import type { CoreStore } from "../../../src/server/banking-core/model";
import * as F from "./fixture";

class Memory implements CoreStore {
  payload: unknown = null; revision: string | null = null; loads = 0; saves = 0;
  async load() { this.loads++; return { revision: this.revision, payload: structuredClone(this.payload) }; }
  async save(payload: unknown, expected: string | null) {
    this.saves++;
    if (expected !== this.revision) throw new Error("STALE");
    this.payload = structuredClone(payload);
    this.revision = coreFingerprint(payload);
    return this.revision;
  }
}

function expectCode(err: unknown, code: string): void {
  expect(err).toBeInstanceOf(BindingError);
  expect((err as BindingError).code).toBe(code);
}

async function expectReject(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expectCode(err, code);
  }
}

function walk(root: string, files: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name === ".next" || name === "banking-core" || name === "actor-binding") continue;
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) files.push(path);
  }
  return files;
}

function remapOwners<T>(value: T, map: Record<string, string>): T {
  const next = structuredClone(value) as T;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    for (const key of ["owner", "group", "id", "actor", "clientId", "holderId"]) {
      const current = rec[key];
      if (typeof current === "string" && map[current]) rec[key] = map[current];
    }
    for (const child of Object.values(rec)) visit(child);
  };
  visit(next);
  return next;
}

function loanWorld(map: Record<string, string>) {
  const g = F.bankingFixture();
  g.credit = [F.creditBook("bankA", ["business", "company-wallet"], "other")];
  return remapOwners(g, map);
}

function facts(companyId: string) {
  return F.creditFacts([F.companyProfile(companyId, 2000000000)]);
}

function loanFrames(companyId: string, target = 59): F.Frame[] {
  return F.frames(target, f => {
    if (f.tick % 30 === 29) f.banking = F.bankFrame(f.tick);
    if (f.tick === 0) f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [F.apply(companyId, 1000, "business", F.term("BULLET"))], facts(companyId)) }];
    if (f.tick === 1) f.credit = [{ bankId: "bankA", frame: F.creditFrame(1, [F.accept(companyId)], facts(companyId)) }];
  }, () => false);
}

function depositFrames(actorId: string, target = 59, extra?: (f: F.Frame) => void): F.Frame[] {
  return F.frames(target, f => {
    if (f.tick % 30 === 29) f.banking = F.bankFrame(f.tick);
    if (f.tick === 0) {
      f.banking = F.bankFrame(0, [
        { id: "open-s", actor: actorId, kind: "OPEN", depositId: "alice-save", bankId: "bankA", product: "SAVINGS" },
      ], null);
    }
    if (f.tick === 1) {
      f.banking = F.bankFrame(1, [
        { id: "dep-s", actor: actorId, kind: "DEPOSIT", depositId: "alice-save", amount: F.usd(1000) },
      ], null);
    }
    extra?.(f);
  }, () => false);
}

function fingerprintOf(payload: unknown): string {
  return coreFingerprint(payload);
}

async function session() {
  const clock = new Clock();
  const auth = authService(clock, new MemoryAuthStore());
  const binding = await ActorBinding.open(auth, new MemoryBindingStore(), { enabled: true, now: clock.now });
  const a = await register(auth, "BindA");
  const b = await register(auth, "BindB");
  const c = await register(auth, "BindC");
  const ctxA = await binding.bindToken(a.rawToken);
  const ctxB = await binding.bindToken(b.rawToken);
  const ctxC = await binding.bindToken(c.rawToken);
  return {
    clock, auth, binding, a, b, c, ctxA, ctxB, ctxC,
    alice: ctxA.actorId, bob: ctxB.actorId, company: ctxC.actorId,
    map: { alice: ctxA.actorId, bob: ctxB.actorId, company: ctxC.actorId },
  };
}

describe("banking-core actor guard default-off", () => {
  it("is default-off and keeps unguarded sys/banking-core behaviour", async () => {
    expect(BANKING_CORE_ACTOR_DEFAULT_ENABLED).toBe(false);
    expect(BANKING_CORE_DEFAULT_ENABLED).toBe(false);
    expect(actorGuardEnabled(undefined)).toBe(false);
    expect(actorGuardEnabled({ actorGuard: "true" })).toBe(false);
    expect(actorGuardEnabled(Object.create({ actorGuard: true }))).toBe(false);
    const g = loanWorld({});
    await expect(BankingCoreEngine.open(new Memory(), g, true, { actorGuard: true })).rejects.toBeInstanceOf(BindingError);
    const store = new Memory();
    const engine = await BankingCoreEngine.open(store, g, true);
    const after = await engine.advance(59, loanFrames("company"));
    expect(after.creditBooks[0]!.loans.length).toBeGreaterThan(0);
    expect(after.creditBooks[0]!.receipts.some((r) => r.accepted)).toBe(true);
  });

  it("is not imported by live app or server routes", () => {
    const roots = [join(process.cwd(), "src/app"), join(process.cwd(), "src/server"), join(process.cwd(), "src/shell")];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        if (/server\/banking-core|@\/server\/banking-core|server\/actor-binding|@\/server\/actor-binding/.test(text)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("banking-core actor guard", () => {
  it("rejects missing, spoofed and cross-account commands with no state, receipt or audit change", async () => {
    const s = await session();
    const g = loanWorld(s.map);
    const dir = await mkdtemp(join(tmpdir(), "banking-core-actor-reject-"));
    try {
      const path = join(dir, "core.json");
      const engine = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true, { actorGuard: true, binding: s.binding });
      const opened = engine.snapshot();
      const before = fingerprintOf(opened);
      const receipts = opened.creditBooks.reduce((n, b) => n + b.receipts.length, 0)
        + (opened.bankingMeta?.receipts.length ?? 0);
      const audit = opened.audit.length;
      const bytes = await readFile(path);
      const apply = F.apply(s.company, 1000, "business", F.term("BULLET"));
      const frame0: F.Frame[] = F.frames(0, f => {
        if (f.tick === 0) f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [apply], facts(s.company)) }];
      }, () => false);

      await expectReject(() => engine.advance(0, frame0), "MISSING_SESSION");
      await expectReject(() => engine.advance(0, frame0, { [apply.id]: s.ctxA }), "ACTOR_MISMATCH");
      const spoofed = { ...apply, actor: s.alice };
      const spoofFrames: F.Frame[] = F.frames(0, f => {
        if (f.tick === 0) f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [spoofed], facts(s.company)) }];
      }, () => false);
      await expectReject(() => engine.advance(0, spoofFrames, { [spoofed.id]: s.ctxA }), "ACTOR_MISMATCH");
      await expectReject(() => engine.advance(0, frame0, { [apply.id]: { ...s.ctxC } }), "FORGED_CONTEXT");
      await expectReject(() => engine.advance(0, frame0, { [apply.id]: structuredClone(s.ctxC) }), "FORGED_CONTEXT");
      await s.auth.logout(s.c.rawToken);
      await expectReject(() => engine.advance(0, frame0, { [apply.id]: s.ctxC }), "SESSION_REJECTED");

      const depositG = remapOwners(F.bankingFixture(), s.map);
      const depEngine = await BankingCoreEngine.open(new Memory(), depositG, true, { actorGuard: true, binding: s.binding });
      const openCmd = { id: "open-s", actor: s.alice, kind: "OPEN" as const, depositId: "alice-save", bankId: "bankA", product: "SAVINGS" as const };
      await depEngine.advance(0, F.frames(0, f => {
        if (f.tick === 0) f.banking = F.bankFrame(0, [openCmd], null);
      }, () => false), { "open-s": s.ctxA });
      const mid = depEngine.snapshot();
      const midFp = fingerprintOf(mid);
      const midReceipts = mid.bankingMeta!.receipts.length;
      const midAudit = mid.audit.length;
      const withdraw = { id: "wd", actor: s.bob, kind: "WITHDRAW" as const, depositId: "alice-save", amount: F.usd(1) };
      await expectReject(() => depEngine.advance(1, F.frames(1, f => {
        if (f.tick === 1) f.banking = F.bankFrame(1, [withdraw], null);
      }, () => false), { wd: s.ctxB }), "ACTOR_MISMATCH");
      expect(fingerprintOf(depEngine.snapshot())).toBe(midFp);
      expect(depEngine.snapshot().bankingMeta!.receipts.length).toBe(midReceipts);
      expect(depEngine.snapshot().audit.length).toBe(midAudit);

      const after = engine.snapshot();
      expect(fingerprintOf(after)).toBe(before);
      expect(after.creditBooks.reduce((n, b) => n + b.receipts.length, 0) + (after.bankingMeta?.receipts.length ?? 0)).toBe(receipts);
      expect(after.audit.length).toBe(audit);
      expect(await readFile(path)).toEqual(bytes);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps guarded and unguarded legitimate commands byte-identical, including restart", async () => {
    const s = await session();
    const g = loanWorld(s.map);
    const frames = loanFrames(s.company);
    const contexts = { apply: s.ctxC, accept: s.ctxC };
    const dir = await mkdtemp(join(tmpdir(), "banking-core-actor-id-"));
    try {
      const offPath = join(dir, "off.json");
      const onPath = join(dir, "on.json");
      const off = await BankingCoreEngine.open(new FileBankingCoreStore(offPath), g, true);
      const on = await BankingCoreEngine.open(new FileBankingCoreStore(onPath), g, true, { actorGuard: true, binding: s.binding });
      const unguarded = await off.advance(59, frames);
      const guarded = await on.advance(59, frames, contexts);
      assertCoreAccounting(unguarded);
      assertCoreAccounting(guarded);
      expect(coreFingerprint(guarded)).toBe(coreFingerprint(unguarded));
      expect(await readFile(onPath)).toEqual(await readFile(offPath));

      const midPath = join(dir, "restart.json");
      let engine = await BankingCoreEngine.open(new FileBankingCoreStore(midPath), g, true, { actorGuard: true, binding: s.binding });
      await engine.advance(1, frames.filter((f) => f.tick <= 1), contexts);
      const mid = engine.snapshot();
      const midBytes = await readFile(midPath);
      engine = await BankingCoreEngine.open(new FileBankingCoreStore(midPath), g, true, { actorGuard: true, binding: s.binding });
      expect(coreFingerprint(engine.snapshot())).toBe(coreFingerprint(mid));
      expect(await readFile(midPath)).toEqual(midBytes);
      const rest = await engine.advance(59, frames, contexts);
      expect(coreFingerprint(rest)).toBe(coreFingerprint(guarded));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs tick-driven effects without an actor and rejects those kinds on the player path", async () => {
    const s = await session();
    const g = remapOwners(F.bankingFixture(), s.map);
    const frames = depositFrames(s.alice, 719);
    const contexts = { "open-s": s.ctxA, "dep-s": s.ctxA };
    const engine = await BankingCoreEngine.open(new Memory(), g, true, { actorGuard: true, binding: s.binding });
    const after = await engine.advance(719, frames, contexts);
    assertCoreAccounting(after);
    const deposit = after.accounts.find((a) => a.id === "alice-save");
    expect(deposit?.owner).toBe(s.alice);
    const paid = after.bankingMeta!.movements.filter((m) => m.kind === "DEPOSIT_INTEREST" && m.depositId === "alice-save");
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.reduce((n, m) => n + m.amount, BigInt(0)) > BigInt(0)).toBe(true);
    expect(after.bankingMeta!.receipts.every((r) => r.id === "open-s" || r.id === "dep-s")).toBe(true);

    const kinds = [
      { banking: { id: "sys", actor: s.alice, kind: "DEPOSIT_INTEREST", depositId: "alice-save" } },
      { banking: { id: "sys", actor: s.alice, kind: "CREDIT_CREATE", loanId: "x", depositId: "alice-save", bankId: "bankA" } },
      { banking: { id: "sys", actor: s.alice, kind: "WRITE_OFF", loanId: "x" } },
      { banking: { id: "sys", actor: s.alice, kind: "LEND", amount: F.usd(1) } },
      { credit: { id: "sys", actor: s.company, kind: "CREDIT_CREATE", loanId: "x", amount: F.usd(1) } },
      { credit: { id: "sys", actor: s.company, kind: "DEFAULT", loanId: "x" } },
      { ccp: { id: "sys", actor: s.alice, kind: "BANK_RESOLUTION", memberId: "d" } },
      { ccp: { id: "sys", actor: s.alice, kind: "CLOSEOUT", memberId: "d" } },
      { liquidity: { id: "sys", actor: s.alice, kind: "BAIL_IN", bankId: "a" } },
    ];
    for (const row of kinds) {
      const raw: F.Frame = { tick: 0, banking: null, credit: [], liquidity: null, ccp: null };
      if ("banking" in row) raw.banking = F.bankFrame(0, [row.banking], null);
      if ("credit" in row) raw.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [row.credit], facts(s.company)) }];
      if ("ccp" in row) raw.ccp = { tick: 0, facts: F.marginFacts(["d"], ["LD"]), commands: [row.ccp] };
      if ("liquidity" in row) raw.liquidity = { tick: 0, facts: null, commands: [row.liquidity] };
      expect(() => decodeCoreFrames([raw], decodeCoreGenesis(g))).toThrow();
    }
  });

  it("authorizes CCP member posts and liquidity moves against the bound owner", async () => {
    const s = await session();
    const c = F.ccpFixture(4);
    const ccpGenesis = remapOwners({
      ledger: F.ledger([F.bank("x", "0")], c.accounts),
      liquidityEnabled: false,
      banking: null,
      credit: [] as unknown[],
      ccp: c.ccp,
    }, { "owner-d": s.alice, "owner-s1": s.bob });
    const post = { id: "post", actor: s.alice, kind: "POST_MARGIN" as const, memberId: "d", service: "LD" as const, amount: F.usd(1) };
    const ccpFrames: F.Frame[] = [{ tick: 0, banking: null, credit: [], liquidity: null, ccp: { tick: 0, facts: F.marginFacts(c.ids, c.services), commands: [post] } }];
    const ccpEngine = await BankingCoreEngine.open(new Memory(), ccpGenesis, true, { actorGuard: true, binding: s.binding });
    await expectReject(() => ccpEngine.advance(0, ccpFrames, { post: s.ctxB }), "ACTOR_MISMATCH");
    const posted = await ccpEngine.advance(0, ccpFrames, { post: s.ctxA });
    expect(posted.ccpMeta!.receipts.some((r) => r.id === "post" && r.outcome === "POSTED_NEXT_P7")).toBe(true);

    const liqMap = { alice: s.alice, bob: s.bob, company: s.company, "owner-a": s.alice, "owner-b": s.bob };
    const liqGenesis = remapOwners({
      ledger: F.liquidityLedger(),
      liquidityEnabled: true,
      banking: null,
      credit: [] as unknown[],
      ccp: null,
    }, liqMap);
    const move = F.ownMove("liq-move", "alice-a", "alice-b", 10, s.alice);
    const liqFrames: F.Frame[] = [{ tick: 0, banking: null, credit: [], liquidity: { tick: 0, facts: F.liquidityFacts(liqGenesis.ledger), commands: [move] }, ccp: null }];
    const liqEngine = await BankingCoreEngine.open(new Memory(), liqGenesis, true, { actorGuard: true, binding: s.binding });
    await expectReject(() => liqEngine.advance(0, liqFrames, { "liq-move": s.ctxB }), "ACTOR_MISMATCH");
    const moved = await liqEngine.advance(0, liqFrames, { "liq-move": s.ctxA });
    const beforeFrom = BigInt("500000000000");
    const afterFrom = moved.accounts.find((a) => a.id === "alice-a")!.lots.reduce((n, l) => n + l.amount, BigInt(0));
    expect(afterFrom < beforeFrom).toBe(true);
    assertCoreAccounting(moved);
  });
});

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ActorBinding,
  BindingError,
  MemoryBindingStore,
  actorIdFor,
  isIssuedActorContext,
  requireBoundActor,
  type ActorContext,
} from "@/server/actor-binding";
import { authService, Clock } from "./fixture";

// Gatekeeper q4 (a7851303): only ActorBinding may issue a context. No exported function of any
// actor-binding module, and no runtime-reachable ActorBinding member, may turn caller-chosen
// fields into a context that passes requireBoundActor.
const accountId = `acc_${"ab".repeat(16)}`;
const actorId = actorIdFor(accountId);
const shape = { actorId, accountId, sessionId: "ses_forged", boundAtMs: 0 } as unknown as ActorContext;
const view = { sessionId: "ses_forged", account: { accountId } };

async function minted(run: () => unknown): Promise<unknown[]> {
  let value: unknown;
  try { value = await run(); } catch { return []; }
  const found: unknown[] = [];
  const visit = (v: unknown, depth: number) => {
    if (v === null || typeof v !== "object" || depth > 2) return;
    if (isIssuedActorContext(v)) found.push(v);
    else for (const inner of Object.values(v)) visit(inner, depth + 1);
  };
  visit(value, 0);
  return found;
}

function expectForged(ctx: unknown): void {
  try { requireBoundActor(ctx as ActorContext, actorId); throw new Error("self-issued context passed requireBoundActor"); }
  catch (err) { expect(err).toBeInstanceOf(BindingError); expect((err as BindingError).code).toBe("FORGED_CONTEXT"); }
}

describe("actor-binding: contexts cannot be self-issued (q4)", () => {
  it("no exported function of any actor-binding module mints a context", async () => {
    const dir = join(process.cwd(), "src/server/actor-binding");
    const hits: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) {
      const mod = (await import(`@/server/actor-binding/${file.replace(/\.ts$/, "")}`)) as Record<string, unknown>;
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn !== "function" || /^class\s/.test(Function.prototype.toString.call(fn))) continue;
        for (const ctx of [...await minted(() => (fn as (...a: unknown[]) => unknown)(shape, "tok")),
          ...await minted(() => (fn as (...a: unknown[]) => unknown)(view, "tok"))]) {
          hits.push(`${file}:${name}`);
          expectForged(ctx);
        }
      }
    }
    expect(hits).toEqual([]);
    expectForged(shape);
  });

  it("no runtime-reachable ActorBinding member mints a context from caller fields", async () => {
    const clock = new Clock();
    const binding = await ActorBinding.open(authService(clock), new MemoryBindingStore(), { enabled: true, now: clock.now });
    const hits: string[] = [];
    const members = [
      ...Object.getOwnPropertyNames(ActorBinding.prototype).filter((n) => n !== "constructor").map((n) => [n, binding] as const),
      ...Object.getOwnPropertyNames(binding).map((n) => [n, binding] as const),
    ];
    for (const [name, self] of members) {
      const fn = (self as unknown as Record<string, unknown>)[name];
      if (typeof fn !== "function") continue;
      for (const arg of [shape, view]) {
        if ((await minted(() => (fn as (...a: unknown[]) => unknown).call(self, arg, "tok"))).length) hits.push(name);
      }
    }
    expect(hits).toEqual([]);
    expect(binding.snapshot().bindings).toEqual([]);
  });

  it("reassigning any runtime-reachable ActorBinding field to a caller's session lookup does not mint", async () => {
    const clock = new Clock();
    const fake = { resolveSession: async () => view, peekSession: async () => view };
    const hits: string[] = [];
    for (const name of Object.getOwnPropertyNames(await ActorBinding.open(authService(clock), new MemoryBindingStore(), { enabled: true, now: clock.now }))) {
      const binding = await ActorBinding.open(authService(clock), new MemoryBindingStore(), { enabled: true, now: clock.now });
      try { (binding as unknown as Record<string, unknown>)[name] = fake; } catch { continue; }
      if ((await minted(() => binding.bindToken("tok"))).length) hits.push(name);
    }
    expect(hits).toEqual([]);
  });
});

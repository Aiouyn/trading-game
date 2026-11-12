import { describe, expect, it } from "vitest";
import { MemoryAuthStore } from "@/server/auth";
import { ActorBinding, BindingError, MemoryBindingStore } from "@/server/actor-binding";
import { authService, register, Clock } from "../actor-binding/fixture";
import { assertLiveCoreCommands, authorizeCoreCommands } from "../../../src/server/banking-core/actor";
import type { CoreFrame } from "../../../src/server/banking-core/model";
import * as F from "./fixture";

function expectCode(err: unknown, code: string): void {
  expect(err).toBeInstanceOf(BindingError);
  expect((err as BindingError).code).toBe(code);
}

async function expectReject(run: () => unknown, code: string): Promise<void> {
  try { await run(); throw new Error(`expected ${code}`); } catch (err) { expectCode(err, code); }
}

async function world() {
  const clock = new Clock();
  const auth = authService(clock, new MemoryAuthStore());
  const binding = await ActorBinding.open(auth, new MemoryBindingStore(), { enabled: true, now: clock.now });
  const a = await register(auth, "QualA");
  const ctx = await binding.bindToken(a.rawToken);
  const open = { id: "open-s", actor: ctx.actorId, kind: "OPEN" as const, depositId: "alice-save", bankId: "bankA", product: "SAVINGS" as const };
  const frames = F.frames(0, (f) => { if (f.tick === 0) f.banking = F.bankFrame(0, [open], null); }, () => false) as unknown as CoreFrame[];
  return { binding, ctx, open, frames };
}

describe("banking-core actor guard: contexts are read as an own property (q5)", () => {
  it("a prototype-inherited contexts map is ignored by authorizeCoreCommands and assertLiveCoreCommands", async () => {
    const w = await world();
    // Control: the same context as an own property authorizes.
    expect(() => authorizeCoreCommands(w.frames, { actorGuard: true, contexts: { [w.open.id]: w.ctx } })).not.toThrow();
    await assertLiveCoreCommands(w.frames, { actorGuard: true, binding: w.binding, contexts: { [w.open.id]: w.ctx } });

    const inherited = Object.assign(Object.create({ contexts: { [w.open.id]: w.ctx } }) as object, { actorGuard: true });
    await expectReject(() => authorizeCoreCommands(w.frames, inherited), "MISSING_SESSION");
    const inheritedLive = Object.assign(Object.create({ contexts: { [w.open.id]: w.ctx } }) as object, { actorGuard: true, binding: w.binding });
    await expectReject(() => assertLiveCoreCommands(w.frames, inheritedLive), "MISSING_SESSION");
  });
});

describe("banking-core actor guard: forged context values are FORGED_CONTEXT (q3)", () => {
  it("Object.create, Proxy and null-prototype context values are FORGED_CONTEXT, not CLAIM_MALFORMED", async () => {
    const w = await world();
    const forgeries: Array<[string, unknown]> = [
      ["Object.create", Object.create(w.ctx)],
      ["Proxy", new Proxy(w.ctx, {})],
      ["null-prototype", Object.assign(Object.create(null) as object, w.ctx)],
      ["spread", { ...w.ctx }],
    ];
    const codes = forgeries.map(([name, value]) => {
      try { authorizeCoreCommands(w.frames, { actorGuard: true, contexts: { [w.open.id]: value } }); return [name, "ACCEPTED"]; }
      catch (err) { return [name, err instanceof BindingError ? err.code : String(err)]; }
    });
    expect(codes).toEqual(forgeries.map(([name]) => [name, "FORGED_CONTEXT"]));
    for (const [, value] of forgeries) {
      await expectReject(() => assertLiveCoreCommands(w.frames, { actorGuard: true, binding: w.binding, contexts: { [w.open.id]: value } }), "FORGED_CONTEXT");
    }
  });

  it("a malformed contexts map stays CLAIM_MALFORMED and its getters never run", async () => {
    const w = await world();
    let ran = 0;
    const getter = Object.defineProperty({}, w.open.id, { enumerable: true, get: () => { ran++; return w.ctx; } });
    const maps: unknown[] = [
      new Proxy({ [w.open.id]: w.ctx }, {}),
      Object.assign(Object.create(null) as object, { [w.open.id]: w.ctx }),
      [w.ctx],
      "contexts",
      getter,
      { "": w.ctx },
    ];
    for (const contexts of maps) {
      await expectReject(() => authorizeCoreCommands(w.frames, { actorGuard: true, contexts }), "CLAIM_MALFORMED");
    }
    expect(ran).toBe(0);
  });
});

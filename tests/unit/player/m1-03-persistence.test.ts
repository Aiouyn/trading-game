import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthError,
  AuthService,
  FileAuthStore,
  MemoryAuthStore,
  PORT_AVALON_WORLD_ID,
  START_CASH_CENTS,
} from "@/server/auth";
import { buildPlayerPrivate, parsePlayerPrivateRecord, cashCentsToMoney } from "@/server/player";
import { getPortAvalonWorld } from "@/shell/worldIdentity";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { getFeed, setFeed } from "@/shell/contracts/useChannel";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { createShellStore } from "@/shell/store";
import { mockChannels } from "@/shell/mockChannels";
import type { AccountId } from "@/server/auth";

describe("M1-03 private ledger persistence", () => {
  const temps: string[] = [];
  afterEach(async () => {
    setFeed(null);
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("world attach reports player_private persistence", () => {
    expect(getPortAvalonWorld().persistence).toBe("player_private");
    expect(getPortAvalonWorld().worldId).toBe(PORT_AVALON_WORLD_ID);
  });

  it("buildPlayerPrivate validates cash, positions, openOrderIds", () => {
    const id = "acc_test" as AccountId;
    expect(buildPlayerPrivate(id, { cashCents: 100, positions: { HALC: 2 }, openOrderIds: ["ord_1"] })).toMatchObject({
      cashCents: 100,
      positions: { HALC: 2 },
      openOrderIds: ["ord_1"],
    });
    expect(() => buildPlayerPrivate(id, { cashCents: -1, positions: {}, openOrderIds: [] })).toThrow(AuthError);
    expect(() => buildPlayerPrivate(id, { cashCents: 1, positions: { bad: 1 }, openOrderIds: [] })).toThrow(AuthError);
    expect(() => buildPlayerPrivate(id, { cashCents: 1, positions: { HALC: 0 }, openOrderIds: [] })).toThrow(AuthError);
  });

  it("file load drops corrupt player rows at boundary", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-03-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    await writeFile(
      file,
      JSON.stringify({
        accounts: [],
        sessions: [],
        players: [
          { accountId: "acc_ok", cashCents: 50, positions: { HALC: 1 }, openOrderIds: [] },
          { accountId: "nope", cashCents: -9, positions: {}, openOrderIds: [] },
          { junk: true },
        ],
      }),
      "utf8",
    );
    const snap = await new FileAuthStore(file).load();
    expect(snap.players).toHaveLength(1);
    expect(snap.players[0]?.cashCents).toBe(50);
    expect(parsePlayerPrivateRecord({ accountId: "acc_x", cashCents: 1.5, positions: {}, openOrderIds: [] })).toBeNull();
  });

  it("cash, positions, openOrderIds survive AuthService restart; isolation holds", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-03-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    const first = new AuthService({ store: new FileAuthStore(file) });
    const a = await first.register({ handle: "PersistA", password: "password1" });
    const b = await first.register({ handle: "PersistB", password: "password1" });
    await first.commitOwnPrivateState(a.view, {
      cashCents: 880_055,
      positions: { HALC: 3, VOLT: 1 },
      openOrderIds: ["ord_a1", "ord_a2"],
    });
    await first.commitOwnPrivateState(b.view, {
      cashCents: 100,
      positions: { GX: 9 },
      openOrderIds: ["ord_b1"],
    });

    const raw = await readFile(file, "utf8");
    expect(raw).not.toContain("password1");
    expect(raw).not.toContain(a.rawToken);
    expect(raw).toContain("passwordHash"); // hashed only

    const second = new AuthService({ store: new FileAuthStore(file) });
    const a2 = await second.resolveSession(a.rawToken);
    const b2 = await second.resolveSession(b.rawToken);
    expect(a2?.account.accountId).toBe(a.view.account.accountId);
    const aPriv = await second.getPlayerPrivate(a2!, a2!.account.accountId);
    const bPriv = await second.getPlayerPrivate(b2!, b2!.account.accountId);
    expect(aPriv).toMatchObject({
      cashCents: 880_055,
      positions: { HALC: 3, VOLT: 1 },
      openOrderIds: ["ord_a1", "ord_a2"],
    });
    expect(bPriv).toMatchObject({
      cashCents: 100,
      positions: { GX: 9 },
      openOrderIds: ["ord_b1"],
    });
    await expect(second.getPlayerPrivate(a2!, b2!.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(aPriv.accountId).not.toBe(bPriv.accountId);
  });

  it("concurrent commits from two accounts both land without clobber", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    const a = await auth.register({ handle: "RaceA", password: "password1" });
    const b = await auth.register({ handle: "RaceB", password: "password1" });
    await Promise.all([
      auth.commitOwnPrivateState(a.view, { cashCents: 111, positions: { HALC: 1 }, openOrderIds: ["oa"] }),
      auth.commitOwnPrivateState(b.view, { cashCents: 222, positions: { VOLT: 2 }, openOrderIds: ["ob"] }),
    ]);
    const aPriv = await auth.getPlayerPrivate(a.view, a.view.account.accountId);
    const bPriv = await auth.getPlayerPrivate(b.view, b.view.account.accountId);
    expect(aPriv.cashCents).toBe(111);
    expect(aPriv.positions).toEqual({ HALC: 1 });
    expect(bPriv.cashCents).toBe(222);
    expect(bPriv.positions).toEqual({ VOLT: 2 });
    expect(aPriv.openOrderIds).toEqual(["oa"]);
    expect(bPriv.openOrderIds).toEqual(["ob"]);
  });

  it("signed-in demo channels use server cashCents (not hardcoded starter)", () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_x", 17, { cashCents: 880_055 });
    expect(store.getState().channels.me.nw).toBe(cashCentsToMoney(880_055));
    expect(store.getState().liveNw).toBe("8800.55");
    expect((getFeed() as MockFeed).scenario.nw).toBe("8800.55");
    expect(START_CASH_CENTS).toBe(1_000_000);
  });
});

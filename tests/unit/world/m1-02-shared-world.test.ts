import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as worldGet } from "@/app/api/world/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as me } from "@/app/api/auth/me/route";
import {
  AuthService,
  MemoryAuthStore,
  PORT_AVALON_WORLD_ID,
  SESSION_COOKIE_NAME,
  setAuthServiceForTests,
} from "@/server/auth";
import {
  getPortAvalonWorld,
  PORT_AVALON_MARKET_SEED,
  worldAttachBody,
} from "@/server/world";
import { applySignedInDemo, DEMO_STARTER_NW } from "@/shell/accountDemoBoundary";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { getFeed, setFeed } from "@/shell/contracts/useChannel";
import { createShellStore } from "@/shell/store";
import { mockChannels } from "@/shell/mockChannels";

function cookieFrom(res: Response): string | null {
  const raw = res.headers.getSetCookie?.() ?? [];
  const list = raw.length ? raw : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  const hit = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!hit) return null;
  return hit.split(";")[0] ?? null;
}

describe("M1-02 shared world identity", () => {
  beforeEach(() => {
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
  });
  afterEach(() => {
    setAuthServiceForTests(undefined);
    setFeed(null);
  });

  it("getPortAvalonWorld is server-owned constant (persistence player_private)", () => {
    const w = getPortAvalonWorld();
    expect(w.worldId).toBe(PORT_AVALON_WORLD_ID);
    expect(w.marketSeed).toBe(PORT_AVALON_MARKET_SEED);
    expect(w.persistence).toBe("player_private");
    expect(worldAttachBody()).toEqual({ world: w });
  });

  it("GET /api/world returns the same attach body", async () => {
    const res = await worldGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { world: { worldId: string; marketSeed: number; persistence: string } };
    expect(body.world.worldId).toBe(PORT_AVALON_WORLD_ID);
    expect(body.world.marketSeed).toBe(PORT_AVALON_MARKET_SEED);
    expect(body.world.persistence).toBe("player_private");
  });

  it("two accounts share world id + marketSeed; private cash stays isolated", async () => {
    const regA = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ handle: "WorldA", password: "password1" }),
      }),
    );
    const regB = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ handle: "WorldB", password: "password1" }),
      }),
    );
    expect(regA.status).toBe(201);
    expect(regB.status).toBe(201);
    const bodyA = (await regA.json()) as {
      account: { accountId: string; worldId: string };
      world: { worldId: string; marketSeed: number; persistence: string };
    };
    const bodyB = (await regB.json()) as {
      account: { accountId: string; worldId: string };
      world: { worldId: string; marketSeed: number; persistence: string };
    };
    expect(bodyA.account.accountId).not.toBe(bodyB.account.accountId);
    expect(bodyA.account.worldId).toBe(PORT_AVALON_WORLD_ID);
    expect(bodyB.account.worldId).toBe(PORT_AVALON_WORLD_ID);
    expect(bodyA.world).toEqual(bodyB.world);
    expect(bodyA.world.worldId).toBe(PORT_AVALON_WORLD_ID);
    expect(bodyA.world.marketSeed).toBe(PORT_AVALON_MARKET_SEED);
    expect(bodyA.world.persistence).toBe("player_private");

    const cookieA = cookieFrom(regA)!;
    const cookieB = cookieFrom(regB)!;
    const meA = (await (await me(new Request("http://localhost/api/auth/me", { headers: { cookie: cookieA, origin: "http://localhost" } }))).json()) as {
      account: { accountId: string; worldId: string };
      player: { accountId: string; cashCents: number };
      world: { worldId: string; marketSeed: number };
    };
    const meB = (await (await me(new Request("http://localhost/api/auth/me", { headers: { cookie: cookieB, origin: "http://localhost" } }))).json()) as {
      account: { accountId: string; worldId: string };
      player: { accountId: string; cashCents: number };
      world: { worldId: string; marketSeed: number };
    };
    expect(meA.world.worldId).toBe(meB.world.worldId);
    expect(meA.world.marketSeed).toBe(meB.world.marketSeed);
    expect(meA.player.accountId).toBe(meA.account.accountId);
    expect(meB.player.accountId).toBe(meB.account.accountId);
    expect(meA.player.accountId).not.toBe(meB.player.accountId);
    expect(meA.player.cashCents).toBe(1_000_000);
    expect(meB.player.cashCents).toBe(1_000_000);
  });

  it("signed-in demo feeds share marketSeed across accounts (not accountId hash)", () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_alpha", PORT_AVALON_MARKET_SEED);
    const seedA = (getFeed() as MockFeed).scenario.seed;
    applySignedInDemo(store, "acc_beta", PORT_AVALON_MARKET_SEED);
    const seedB = (getFeed() as MockFeed).scenario.seed;
    expect(seedA).toBe(PORT_AVALON_MARKET_SEED);
    expect(seedB).toBe(PORT_AVALON_MARKET_SEED);
    expect(store.getState().channels.me.nw).toBe(DEMO_STARTER_NW);
  });
});

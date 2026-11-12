import { describe, expect, it } from "vitest";
import { AuthService, MemoryAuthStore } from "@/server/auth";
import {
  ATTEMPT_THROTTLE_FAILURES_PER_SEC,
  ATTEMPT_THROTTLE_MAX_ENTRIES,
  attemptThrottleBudget,
  AttemptThrottle,
} from "@/server/auth/throttle";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

describe("AttemptThrottle bounds", () => {
  it("sizes the login map from the 200/s failure bound so lockouts cannot fill it", () => {
    expect(ATTEMPT_THROTTLE_FAILURES_PER_SEC).toBe(200);
    const budget = attemptThrottleBudget(10, LOGIN_WINDOW_MS);
    expect(budget.globalFailureCap).toBe(180_000);
    expect(budget.maxEntries).toBe(18_001);
    expect(ATTEMPT_THROTTLE_MAX_ENTRIES).toBe(18_001);

    const t = new AttemptThrottle(10, LOGIN_WINDOW_MS, () => 0);
    const before = process.memoryUsage().heapUsed;
    const lockouts = Math.floor(budget.globalFailureCap / 10);
    for (let i = 0; i < lockouts; i++) {
      const key = `h${i.toString(10).padStart(8, "0")}`;
      for (let hit = 0; hit < 10; hit++) t.hit(key);
    }
    const heapDelta = process.memoryUsage().heapUsed - before;
    expect(t.size).toBe(lockouts);
    expect(t.size).toBeLessThan(budget.maxEntries);
    expect(t.check("h00000000")).toBeGreaterThan(0);
    expect(t.check("unrelated-handle")).toBeGreaterThan(0);
    expect(heapDelta).toBeLessThan(32 * 1024 * 1024);
  }, 30_000);

  it("keeps an in-window lockout through a 5,000-key flood and still admits a new key under the bound", () => {
    const t = new AttemptThrottle(10, LOGIN_WINDOW_MS, () => 0);
    for (let i = 0; i < 10; i++) t.hit("victim");
    expect(t.check("victim")).toBeGreaterThan(0);
    for (let i = 0; i < 5_000; i++) t.hit(`flood${i}`);
    expect(t.size).toBeLessThan(ATTEMPT_THROTTLE_MAX_ENTRIES);
    expect(t.check("victim")).toBeGreaterThan(0);
    expect(t.check("someone-else")).toBeNull();
  });

  it("lets a correct login through while the failure budget is unspent", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    await auth.register({ handle: "Keeper", password: "password1" });
    for (let i = 0; i < 12; i++) {
      await expect(auth.login({ handle: `Nope${i}`, password: "wrong-pass" })).rejects.toMatchObject({
        code: "BAD_CREDENTIALS",
      });
    }
    const ok = await auth.login({ handle: "Keeper", password: "password1" });
    expect(ok.view.account.handle).toBe("Keeper");
  }, 30_000);

  it("fails closed for a new key when every slot is a live lockout", () => {
    const t = new AttemptThrottle(1, 60_000, () => 0, 32, 10_000);
    for (let i = 0; i < 32; i++) t.hit(`lock${i}`);
    expect(t.size).toBe(32);
    expect(t.check("lock0")).toBeGreaterThan(0);
    expect(t.check("newcomer")).toBeGreaterThan(0);
    expect(t.size).toBe(32);
    t.hit("newcomer");
    expect(t.size).toBe(32);
    expect(t.check("lock0")).toBeGreaterThan(0);
    expect(t.check("lock31")).toBeGreaterThan(0);
  });

  it("refuses only new keys after the global failure cap", () => {
    let now = 0;
    const t = new AttemptThrottle(10, 1_000, () => now, 50, 3);
    t.hit("partial");
    t.hit("partial");
    t.hit("partial");
    expect(t.check("partial")).toBeNull();
    expect(t.check("fresh")).toBeGreaterThan(0);
    t.hit("fresh");
    expect(t.size).toBe(1);
    now = 1_000;
    expect(t.check("fresh")).toBeNull();
  });

  it("caps a trusted client key without locking a different client", () => {
    const t = new AttemptThrottle(2, 60_000, () => 0, 20, 100);
    t.hit("alpha", "ip:198.51.100.10");
    t.hit("beta", "ip:198.51.100.10");
    expect(t.check("gamma", "ip:198.51.100.10")).toBeGreaterThan(0);
    expect(t.check("delta", "ip:198.51.100.11")).toBeNull();
  });

  it("drops a zero-count entry before a live lockout", () => {
    const t = new AttemptThrottle(2, 1_000, () => 0, 2);
    t.hit("locked");
    t.hit("locked");
    expect(t.check("locked")).toBeGreaterThan(0);
    expect(t.check("zero")).toBeNull();
    expect(t.size).toBe(2);
    t.hit("fresh");
    expect(t.size).toBe(2);
    expect(t.check("locked")).toBeGreaterThan(0);
    expect(t.check("fresh")).toBeNull();
  });

  it("resets expired buckets and drops them from the map", () => {
    let now = 0;
    const t = new AttemptThrottle(1, 1_000, () => now);
    for (let i = 0; i < 100; i++) {
      t.hit(`k${i}`);
      expect(t.check(`k${i}`)).toBeGreaterThan(0);
    }
    expect(t.size).toBe(100);
    now = 999;
    expect(t.check("k0")).toBeGreaterThan(0);
    now = 1_000;
    expect(t.check("k0")).toBeNull();
    expect(t.size).toBe(1);
    t.hit("k0");
    expect(t.check("k0")).toBeGreaterThan(0);
    expect(t.check("k1")).toBeNull();
  });
});

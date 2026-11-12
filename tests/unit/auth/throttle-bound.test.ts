import { describe, expect, it } from "vitest";
import { ATTEMPT_THROTTLE_MAX_ENTRIES, AttemptThrottle } from "@/server/auth/throttle";

describe("AttemptThrottle bounds", () => {
  it("keeps an in-window lockout through a 5,000-key flood", () => {
    expect(ATTEMPT_THROTTLE_MAX_ENTRIES).toBeLessThan(5_000);
    const t = new AttemptThrottle(10, 15 * 60 * 1000, () => 0);
    for (let i = 0; i < 10; i++) t.hit("victim");
    expect(t.check("victim")).toBeGreaterThan(0);
    for (let i = 0; i < 5_000; i++) t.hit(`flood${i}`);
    expect(t.size).toBeLessThan(5_000);
    expect(t.size).toBeLessThanOrEqual(ATTEMPT_THROTTLE_MAX_ENTRIES);
    expect(t.check("victim")).toBeGreaterThan(0);
  });

  it("fails closed for a new key when every slot is a live lockout", () => {
    const t = new AttemptThrottle(1, 60_000, () => 0);
    for (let i = 0; i < ATTEMPT_THROTTLE_MAX_ENTRIES; i++) t.hit(`lock${i}`);
    expect(t.size).toBe(ATTEMPT_THROTTLE_MAX_ENTRIES);
    expect(t.check("lock0")).toBeGreaterThan(0);
    expect(t.check("newcomer")).toBeGreaterThan(0);
    expect(t.size).toBe(ATTEMPT_THROTTLE_MAX_ENTRIES);
    t.hit("newcomer");
    expect(t.size).toBe(ATTEMPT_THROTTLE_MAX_ENTRIES);
    expect(t.check("lock0")).toBeGreaterThan(0);
    expect(t.check(`lock${ATTEMPT_THROTTLE_MAX_ENTRIES - 1}`)).toBeGreaterThan(0);
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

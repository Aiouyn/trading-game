import { describe, expect, it } from "vitest";
import { ATTEMPT_THROTTLE_MAX_ENTRIES, AttemptThrottle } from "@/server/auth/throttle";

describe("AttemptThrottle bounds", () => {
  it("stays under 5,000 keys and drops the oldest past the cap", () => {
    expect(ATTEMPT_THROTTLE_MAX_ENTRIES).toBeLessThan(5_000);
    const t = new AttemptThrottle(1, 60_000, () => 0);
    t.hit("first");
    expect(t.check("first")).toBeGreaterThan(0);
    for (let i = 0; i < 5_000; i++) t.hit(`u${i}`);
    expect(t.size).toBeLessThan(5_000);
    expect(t.size).toBe(ATTEMPT_THROTTLE_MAX_ENTRIES);
    expect(t.check("first")).toBeNull();
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

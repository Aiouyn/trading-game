import { describe, expect, it } from "vitest";
import { resolveQuayE2eFlag } from "../../../tools/quay-e2e-flag";

describe("resolveQuayE2eFlag", () => {
  it("inlines 0 when the flag is unset, even if the official marker is present", () => {
    expect(resolveQuayE2eFlag({})).toBe("0");
    expect(resolveQuayE2eFlag({ QUAY_OFFICIAL_E2E_BUILD: "1" })).toBe("0");
  });

  it("returns 1 only when both the flag and the official e2e marker are set", () => {
    expect(resolveQuayE2eFlag({ NEXT_PUBLIC_QUAY_E2E: "1", QUAY_OFFICIAL_E2E_BUILD: "1" })).toBe("1");
  });

  it("fails the build when the flag is set without the official marker", () => {
    expect(() => resolveQuayE2eFlag({ NEXT_PUBLIC_QUAY_E2E: "1" })).toThrow(/QUAY_OFFICIAL_E2E_BUILD/);
    expect(() => resolveQuayE2eFlag({ NEXT_PUBLIC_QUAY_E2E: "1", QUAY_OFFICIAL_E2E_BUILD: "0" })).toThrow(/cannot turn the consent prompt off/);
  });
});

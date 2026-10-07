import { describe, it, expect } from "vitest";
import { APP_NAME } from "@/lib/app";

describe("scaffold", () => {
  it("resolves the @ alias", () => {
    expect(APP_NAME).toBe("Trading Game");
  });
});
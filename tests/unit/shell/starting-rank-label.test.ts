// Card 20: R0's player-facing label is Starter (spec table name remains Broke; id and thresholds unchanged).
import { describe, expect, it } from "vitest";
import { RANK_NAMES, RANKS } from "@/shell/registry";

describe("Card 20 starting rank label", () => {
  it("R0 reads Starter, not Broke; the other names and the id ladder stay as 14 wrote them", () => {
    expect(RANKS).toEqual(["R0", "R1", "R2", "R3", "R4", "R5", "R6"]);
    expect(RANK_NAMES.R0).toBe("Starter");
    expect(Object.values(RANK_NAMES)).not.toContain("Broke");
    expect(RANK_NAMES).toMatchObject({
      R1: "Hustler", R2: "Owner", R3: "Mogul", R4: "Tycoon", R5: "Titan", R6: "Dynasty",
    });
  });
});

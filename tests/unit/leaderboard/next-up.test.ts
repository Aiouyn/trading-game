// Card 12: the closest player above, a unique lead, and a tie are derived only from the public board rows.
import { describe, expect, it } from "vitest";
import { nextUpFromView } from "@/apps/boards/nextUp";
import type { LeaderboardRow, LeaderboardView } from "@/market/leaderboard";

const row = (rank: number, handle: string, nw: string, self = false): LeaderboardRow => ({ rank, handle, nw, self });
const view = (rows: LeaderboardRow[], self: LeaderboardRow | null, players = rows.length): LeaderboardView => ({
  worldId: "world_port_avalon" as LeaderboardView["worldId"], tick: 1, players, rows, self,
});

describe("nextUpFromView", () => {
  it("names the closest player above and the exact net-worth gap", () => {
    const self = row(3, "Mina", "9992.15", true);
    const v = view([
      row(1, "CurlTest1", "10000.00"),
      row(1, "NewPlayer", "10000.00"),
      self,
    ], self);
    expect(nextUpFromView(v)).toEqual({ kind: "ahead", handle: "NewPlayer", ahead: "7.85" });
  });

  it("when several share that higher net worth, names the neighbour immediately above in list order", () => {
    const self = row(4, "Mina", "9000.00", true);
    const v = view([
      row(1, "Zed", "12000.00"),
      row(2, "Ann", "10000.00"),
      row(2, "Bob", "10000.00"),
      self,
    ], self);
    expect(nextUpFromView(v)).toEqual({ kind: "ahead", handle: "Bob", ahead: "1000.00" });
  });

  it("a unique lead has no Next up", () => {
    const self = row(1, "Mina", "12000.00", true);
    const v = view([self, row(2, "Ann", "10000.00")], self);
    expect(nextUpFromView(v)).toEqual({ kind: "lead" });
  });

  it("a shared best net worth is a tie, not Next up", () => {
    const self = row(1, "Mina", "10000.00", true);
    const v = view([row(1, "Ann", "10000.00"), self, row(3, "Bob", "9000.00")], self);
    expect(nextUpFromView(v)).toEqual({ kind: "tied", others: 1, nw: "10000.00" });
  });

  it("an unvalued account, or a neighbour not in the top rows, does not invent a gap", () => {
    expect(nextUpFromView(view([row(1, "Ann", "10000.00")], null))).toEqual({ kind: "none" });
    const self = row(15, "Mina", "1000.00", true);
    const v = view([row(1, "Ann", "50000.00"), row(2, "Bob", "40000.00")], self, 20);
    expect(nextUpFromView(v)).toEqual({ kind: "none" });
  });
});

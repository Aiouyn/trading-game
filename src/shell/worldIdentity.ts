/**
 * Port Avalon shared-world identity literals (M1-02).
 * Pure client+server module. Server `/api/world` and auth session bodies are authoritative;
 * signed-in demo feed attaches with marketSeed (never an accountId hash).
 * persistence player_private after M1-03 (private ledger only).
 * M1-05 quotes advance on one in-process server clock from that seed. They are not durable across restart.
 */
export type WorldId = string & { readonly __brand: "WorldId" };

/** Single shared world stamp for V1. */
export const PORT_AVALON_WORLD_ID = "world_port_avalon" as WorldId;

/** Fixed market RNG seed. The server clock (M1-05) evolves every signed-in quote from this seed. */
export const PORT_AVALON_MARKET_SEED = 17;

export type WorldPersistence = "none" | "player_private";

export type PortAvalonWorldView = {
  readonly worldId: WorldId;
  readonly marketSeed: number;
  /** player_private = cash, positions (qty+avgCost) and open orders durable across restart.
   *  Shared quotes are the single-process clock only; a restart begins them again. Not multi-instance hosting. */
  readonly persistence: WorldPersistence;
};

export function getPortAvalonWorld(): PortAvalonWorldView {
  return {
    worldId: PORT_AVALON_WORLD_ID,
    marketSeed: PORT_AVALON_MARKET_SEED,
    persistence: "player_private",
  };
}

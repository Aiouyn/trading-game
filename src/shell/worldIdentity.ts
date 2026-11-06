/**
 * Port Avalon shared-world identity literals (M1-02).
 * Pure client+server module. Server `/api/world` and auth session bodies are authoritative;
 * signed-in demo feed attaches with marketSeed (never an accountId hash).
 * persistence player_private after M1-03 (private ledger only).
 */
export type WorldId = string & { readonly __brand: "WorldId" };

/** Single shared world stamp for V1. */
export const PORT_AVALON_WORLD_ID = "world_port_avalon" as WorldId;

/** Fixed market RNG seed for every signed-in attach until M1-04/05 own ticks. */
export const PORT_AVALON_MARKET_SEED = 17;

export type WorldPersistence = "none" | "player_private";

export type PortAvalonWorldView = {
  readonly worldId: WorldId;
  readonly marketSeed: number;
  /** player_private = cash, positions (qty+avgCost) and open orders durable; market/ticks not yet (M1-04+). */
  readonly persistence: WorldPersistence;
};

export function getPortAvalonWorld(): PortAvalonWorldView {
  return {
    worldId: PORT_AVALON_WORLD_ID,
    marketSeed: PORT_AVALON_MARKET_SEED,
    persistence: "player_private",
  };
}

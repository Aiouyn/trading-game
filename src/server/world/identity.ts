/**
 * Server attach/read seam for Port Avalon (M1-02).
 * Literals live in `@/shell/worldIdentity` so the client demo boundary can share them
 * without a separate registry. This module owns the HTTP body shape.
 */
export {
  PORT_AVALON_WORLD_ID,
  PORT_AVALON_MARKET_SEED,
  getPortAvalonWorld,
  type PortAvalonWorldView,
  type WorldPersistence,
} from "@/shell/worldIdentity";
import { getPortAvalonWorld, type PortAvalonWorldView } from "@/shell/worldIdentity";

/** JSON body for GET /api/world and auth session attach. */
export function worldAttachBody(): { world: PortAvalonWorldView } {
  return { world: getPortAvalonWorld() };
}

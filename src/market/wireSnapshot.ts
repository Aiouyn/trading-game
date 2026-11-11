// M1-09 GET /api/wire reply: the server's stories for the one world, under the clock's epoch (a restarted server is a
// new epoch whose clock and stories start again). Parsed strictly at the client boundary like /api/market.
import type { WireItem } from "@/shell/contracts/channels";
import { int, newsBody, obj, str, unknownV } from "@/shell/contracts/schema";
import { PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";

export interface WireSnapshot { worldId: string; epoch: string; tick: number; items: WireItem[] }

const shape = obj({ worldId: str, epoch: str, tick: int, items: unknownV });
const EPOCH = /^[a-z0-9]{1,16}$/;

/** Null for anything that is not one well-formed reply from the Port Avalon world. */
export function parseWireSnapshot(raw: unknown): WireSnapshot | null {
  try {
    const v = shape(raw);
    if (v.worldId !== PORT_AVALON_WORLD_ID || !EPOCH.test(v.epoch) || v.tick < 0) return null;
    const { items } = newsBody({ items: v.items });
    for (const i of items) {
      if (i.tick > v.tick) return null;
      for (const e of i.effects ?? []) if (!(Number(e.from) > 0 && Number(e.to) > 0)) return null;
    }
    return { worldId: v.worldId, epoch: v.epoch, tick: v.tick, items };
  } catch {
    return null;
  }
}

import { getAuthService } from "@/server/auth";
import { getLiveMarket } from "@/server/market/clock";
import { listedDef } from "@/market/listings";
import { LaunchpadService } from "./service";

export { LaunchpadService } from "./service";
export type { LaunchpadView, CoinView, HistoryView, LaunchReply, TradeReply } from "./service";

const g = globalThis as typeof globalThis & { __portAvalonLaunchpad?: LaunchpadService };

/** Process singleton. Resolves the auth service and the market clock on each call, so test swaps are honoured. */
export function getLaunchpad(): LaunchpadService {
  return (g.__portAvalonLaunchpad ??= new LaunchpadService({
    auth: getAuthService,
    tick: () => getLiveMarket().snapshot().tick,
    list: (def) => getLiveMarket().list(def, { announce: true }), // a fresh graduation: its listing on the Wire
    mark: (ticker) => getLiveMarket().listedMark(ticker),
  }));
}

/**
 * L4 listing sync: list every graduated coin of the saved Launchpad on the current server clock (idempotent). A
 * graduation lists its coin in its own commit; this covers a process start (the save already has graduated coins) and a
 * clock swapped in tests. Every route that reads quotes, candles, the Broker or the catalog awaits it first, so no
 * reader sees a ledger position in an asset its clock does not quote. An untrusted save lists nothing (it reads 503).
 */
export async function syncListings(): Promise<void> {
  const market = getLiveMarket(), auth = getAuthService();
  // Once per (save, clock): after that every graduation lists its own coin inside its commit.
  if (synced.get(auth)?.has(market)) return;
  let coins: Awaited<ReturnType<typeof auth.listedCoins>>;
  try {
    coins = await auth.listedCoins();
  } catch (err) {
    console.error("[launchpad] listing sync could not read the save", err); // the route's own read reports it
    return;
  }
  if (!coins) return; // the save is not trusted (503): nothing is listed, and the next read checks again
  for (const c of coins) {
    if (!market.isListed(c.ticker)) market.list(listedDef(c.ticker, c.name, c.price), { hype: c.hype });
  }
  if (!synced.has(auth)) synced.set(auth, new WeakSet());
  synced.get(auth)!.add(market);
}
const synced = new WeakMap<object, WeakSet<object>>();

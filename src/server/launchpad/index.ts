import { getAuthService } from "@/server/auth";
import { getLiveMarket } from "@/server/market/clock";
import { LaunchpadService } from "./service";

export { LaunchpadService } from "./service";
export type { LaunchpadView, CoinView, LaunchReply, TradeReply } from "./service";

const g = globalThis as typeof globalThis & { __portAvalonLaunchpad?: LaunchpadService };

/** Process singleton. Resolves the auth service and the market clock on each call, so test swaps are honoured. */
export function getLaunchpad(): LaunchpadService {
  return (g.__portAvalonLaunchpad ??= new LaunchpadService({ auth: getAuthService, tick: () => getLiveMarket().snapshot().tick }));
}

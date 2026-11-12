import { getAuthService } from "@/server/auth";
import { getCandles } from "@/server/market/candles";
import { getLiveMarket } from "@/server/market/clock";
import { listedDef } from "@/market/listings";
import { BrokerService } from "./service";

const globalForBroker = globalThis as typeof globalThis & { __portAvalonBroker?: BrokerService };

/** Process singleton. Resolves the auth service and market clock on each call, so test swaps are honoured. */
export function getBroker(): BrokerService {
  if (!globalForBroker.__portAvalonBroker) {
    globalForBroker.__portAvalonBroker = new BrokerService({
      auth: getAuthService, market: getLiveMarket,
      onFills: (fills) => getCandles(getLiveMarket()).recordFills(fills),
      list: (coins) => {
        const market = getLiveMarket();
        for (const c of coins) if (!market.isListed(c.ticker)) market.list(listedDef(c.ticker, c.name, c.price), { hype: c.hype });
      },
    });
  }
  const broker = globalForBroker.__portAvalonBroker;
  broker.attach();
  getCandles(getLiveMarket()); // the candle history samples the same clock from the first Broker or market read
  return broker;
}

export function setBrokerForTests(broker: BrokerService | undefined): void {
  globalForBroker.__portAvalonBroker = broker;
}

import { getAuthService } from "@/server/auth";
import { getLiveMarket } from "@/server/market/clock";
import { BrokerService } from "./service";

const globalForBroker = globalThis as typeof globalThis & { __portAvalonBroker?: BrokerService };

/** Process singleton. Resolves the auth service and market clock on each call, so test swaps are honoured. */
export function getBroker(): BrokerService {
  if (!globalForBroker.__portAvalonBroker) {
    globalForBroker.__portAvalonBroker = new BrokerService({ auth: getAuthService, market: getLiveMarket });
  }
  const broker = globalForBroker.__portAvalonBroker;
  broker.attach();
  return broker;
}

export function setBrokerForTests(broker: BrokerService | undefined): void {
  globalForBroker.__portAvalonBroker = broker;
}

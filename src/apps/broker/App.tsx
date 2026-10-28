"use client";
// Broker app (UI card 4, 17B BRK-A): the simple market ticket. `context` is the window's assetId (launcher `tk:`
// items, `/broker?asset=`); without it the header offers a select over the watchlist tickers.
import { BrokerFrame } from "./BrokerFrame";

export default function BrokerApp({ context }: { context?: string }) {
  // A new context (the window reused for another ticker) starts a fresh ticket.
  return <BrokerFrame key={context ?? ""} context={context} />;
}

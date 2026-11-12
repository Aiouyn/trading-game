"use client";
// Broker app (UI card 4, 17B BRK-A): the simple market ticket. `context` is the window's assetId (launcher `tk:`
// items, `/broker?asset=`); without it the header offers a select over the watchlist tickers.
import { RetryableBoundary } from "@/components/shell/retryableLazy";
import { S } from "@/shell/strings";
import { BrokerFrame } from "./BrokerFrame";
import "./broker.css";

function BrokerBootFallback() {
  return (
    <div className="br" data-testid="broker" data-state="loading">
      <div className="br-grid">
        <div className="br-col br-col-head"><div className="br-skel br-skel-head" data-testid="br-loading" /></div>
        <div className="br-col br-col-ticket"><div className="br-skel br-skel-ticket" /></div>
      </div>
    </div>
  );
}

export default function BrokerApp({ context }: { context?: string }) {
  // A new context (the window reused for another ticker) starts a fresh ticket.
  return (
    <RetryableBoundary
      fallback={<BrokerBootFallback />}
      errorMessage={S.couldntLoad}
      retryLabel={S.retry}
      errorTestId="br-locale-error"
      retryTestId="br-locale-retry"
    >
      <BrokerFrame key={context ?? ""} context={context} />
    </RetryableBoundary>
  );
}

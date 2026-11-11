"use client";
import { S } from "@/shell/strings";
import { setTelemetryConsent } from "@/shell/telemetryClient";
import "./consent.css";

export function ConsentPrompt({ onDone }: { onDone: () => void }) {
  function choose(granted: boolean) {
    setTelemetryConsent(granted);
    onDone();
  }
  return (
    <div className="quay-consent" role="dialog" aria-label={S.consentAria} data-testid="quay-consent">
      <p className="quay-consent-text">{S.consentPrompt}</p>
      <div className="quay-consent-actions">
        <button type="button" className="chip" data-testid="quay-consent-accept" onClick={() => choose(true)}>{S.consentAccept}</button>
        <button type="button" className="chip" data-testid="quay-consent-decline" onClick={() => choose(false)}>{S.consentDecline}</button>
      </div>
    </div>
  );
}

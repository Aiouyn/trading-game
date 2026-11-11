"use client";
import { CS } from "./consentStrings";
import { setTelemetryConsent } from "@/shell/telemetryConsent";
import "./consent.css";

export function ConsentPrompt({ onDone }: { onDone: () => void }) {
  function choose(granted: boolean) {
    setTelemetryConsent(granted);
    onDone();
  }
  return (
    <div className="quay-consent" role="dialog" aria-label={CS.aria} data-testid="quay-consent">
      <p className="quay-consent-text">{CS.prompt}</p>
      <div className="quay-consent-actions">
        <button type="button" className="chip" data-testid="quay-consent-accept" onClick={() => choose(true)}>{CS.accept}</button>
        <button type="button" className="chip" data-testid="quay-consent-decline" onClick={() => choose(false)}>{CS.decline}</button>
      </div>
    </div>
  );
}

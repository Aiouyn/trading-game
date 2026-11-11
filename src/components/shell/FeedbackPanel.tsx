"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { S } from "@/shell/strings";
import { hasAnalyticsConsent, sendFeedback, setTelemetryConsent } from "@/shell/telemetryClient";
import "./feedback.css";

const MAX = 1000;

export function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [thanks, setThanks] = useState(false);
  const [consented, setConsented] = useState(() => hasAnalyticsConsent());
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await sendFeedback(body.slice(0, MAX), window.location.pathname || "/");
    setBusy(false);
    if (ok) setThanks(true);
  }

  function onConsentToggle() {
    const next = !consented;
    setTelemetryConsent(next);
    setConsented(next);
  }

  return (
    <div className="quay-feedback-panel" role="dialog" aria-label={S.feedback} data-testid="quay-feedback-form">
      {thanks ? (
        <p data-testid="quay-feedback-thanks">{S.feedbackThanks}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <label className="quay-feedback-label" htmlFor="quay-feedback-text">{S.feedbackPrompt}</label>
          <textarea
            id="quay-feedback-text"
            data-testid="quay-feedback-text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={4}
            maxLength={MAX}
            required
          />
          <div className="quay-feedback-actions">
            <Button type="submit" size="sm" disabled={busy || !text.trim()}>{S.feedbackSend}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>{S.close}</Button>
          </div>
        </form>
      )}
      <button type="button" className="quay-feedback-optout" data-testid="quay-feedback-optout" onClick={onConsentToggle}>
        {consented ? S.feedbackOptOut : S.feedbackOptIn}
      </button>
    </div>
  );
}

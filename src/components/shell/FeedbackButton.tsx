"use client";
import { useCallback, useState } from "react";
import { asDefault, retryableLazy } from "@/components/shell/retryableLazy";
import { S } from "@/shell/strings";
import "./feedback.css";

const RetryableFeedbackPanel = retryableLazy(async () => asDefault((await import("./FeedbackPanel")).FeedbackPanel));

function CommentMark() {
  return (
    <svg aria-hidden="true" width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6h14v10H9l-4 3V6z" />
    </svg>
  );
}

export function FeedbackButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="quay-feedback">
      <button
        type="button"
        className="chip quay-feedback-btn"
        data-testid="quay-feedback"
        // Compact (icon only): "Share a comment" — the name must not contain "Back", which is a
        // substring of "Feedback" and would steal getByRole({ name: "Back" }). With visible text,
        // the accessible name has to include that text (axe label-content-name-mismatch).
        aria-label={compact ? S.feedbackAria : S.feedback}
        onClick={toggle}
      >
        {compact ? <CommentMark /> : S.feedback}
      </button>
      {open ? (
        <RetryableFeedbackPanel
          onClose={close}
          fallback={<div className="quay-feedback-panel quay-feedback-skel" data-testid="quay-feedback-loading" aria-busy="true" role="status" />}
          errorMessage={S.couldntLoad}
          retryLabel={S.retry}
          errorTestId="quay-feedback-error"
          retryTestId="quay-feedback-retry"
        />
      ) : null}
    </div>
  );
}

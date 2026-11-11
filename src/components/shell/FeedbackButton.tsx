"use client";
import { lazy, Suspense, useCallback, useState } from "react";
import { S } from "@/shell/strings";

const FeedbackPanel = lazy(() => import("./FeedbackPanel").then((m) => ({ default: m.FeedbackPanel })));

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
      <button type="button" className="chip quay-feedback-btn" data-testid="quay-feedback" aria-label={S.feedbackAria} onClick={toggle}>
        {compact ? <CommentMark /> : S.feedback}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <FeedbackPanel onClose={close} />
        </Suspense>
      ) : null}
    </div>
  );
}

"use client";
import { lazy, Suspense, useCallback, useState } from "react";
import { S } from "@/shell/strings";

const FeedbackPanel = lazy(() => import("./FeedbackPanel").then((m) => ({ default: m.FeedbackPanel })));

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="quay-feedback">
      <button type="button" className="chip quay-feedback-btn" data-testid="quay-feedback" onClick={toggle}>
        {S.feedback}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <FeedbackPanel onClose={close} />
        </Suspense>
      ) : null}
    </div>
  );
}

"use client";
// Accept and Decline for one open invitation. The same card is the diary, a letter, and a person's page.
import { Button } from "@/components/ui/Button";
import { answerCmd, type DiaryPlan } from "./read";
import "./diary.css";

export function InviteActions({ plan, primary, busy, onGo }: {
  plan: DiaryPlan;
  primary?: boolean;
  busy: boolean;
  onGo: (cmd: Record<string, unknown>) => void;
}) {
  if (!plan.open) {
    return plan.answer ? <p className="dia-answer" data-testid="invite-answer">{plan.answer}</p> : null;
  }
  return (
    <div className="dia-acts">
      <Button variant={primary ? "primary" : "secondary"} disabled={busy} data-testid="accept-invite" onClick={() => onGo(answerCmd(plan, true))}>
        {busy ? "Sending…" : "Accept"}
      </Button>
      <Button variant="secondary" disabled={busy} data-testid="ask-decline" onClick={() => onGo(answerCmd(plan, false))}>
        {busy ? "Sending…" : "Decline"}
      </Button>
    </div>
  );
}

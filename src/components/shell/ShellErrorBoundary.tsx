"use client";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { S } from "@/shell/strings";
import { reportClientError } from "@/shell/telemetryClient";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ShellErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(err: Error): void {
    reportClientError(err.message || "client error", typeof window !== "undefined" ? window.location.pathname : "/");
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="shell-error" role="alert" data-testid="shell-error">
          <p>{S.shellError}</p>
          <Button type="button" data-testid="shell-error-retry" onClick={() => window.location.reload()}>
            {S.shellErrorRetry}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

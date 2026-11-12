// Local boundary around the lazy statement composer. RetryableModule (bfe320dd) is not in this base.
"use client";
import { Component, createElement, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { WireStrings } from "./strings";

export type ComposerModule = { default: ComponentType<{ t: WireStrings }> };
type Props = { t: WireStrings; fallback?: ReactNode };
type State = { failed: boolean };

export function loadComposer(): Promise<ComposerModule> {
  return import("./Composer").then((m) => ({ default: m.Composer }));
}

/** Factory so a failed import can be remounted, and tests can inject a throwing loader. */
export function retryableComposer(load: () => Promise<ComposerModule>) {
  let current = lazy(load);
  return class RetryableComposer extends Component<Props, State> {
    state: State = { failed: false };
    private Body = current;

    static getDerivedStateFromError(): State {
      return { failed: true };
    }

    private retry = () => {
      if (this.Body === current) current = lazy(load);
      this.Body = current;
      this.setState({ failed: false });
    };

    render() {
      const { t, fallback = null } = this.props;
      if (this.state.failed) {
        return (
          <div className="wire-composer-error" role="alert" data-testid="wire-composer-error">
            <p className="muted">{t.composer.loadError}</p>
            <Button type="button" size="sm" onClick={this.retry} data-testid="wire-composer-retry">
              {t.composer.retry}
            </Button>
          </div>
        );
      }
      return <Suspense fallback={fallback}>{createElement(this.Body, { t })}</Suspense>;
    }
  };
}

export const RetryableComposer = retryableComposer(loadComposer);

// Shared retry boundary around a lazy() chunk, same remount pattern as RetryableComposer:
// a failed import shows a short message and Retry, which builds a new lazy() generation
// instead of crashing the window.
"use client";
import { Component, createElement, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type State = { failed: boolean };

export type RetryableLazyProps = {
  fallback?: ReactNode;
  errorMessage: string;
  retryLabel: string;
  errorTestId?: string;
  retryTestId?: string;
};

/** Wrap a named export so a dynamic import satisfies `{ default }`. */
export function asDefault<P extends object>(Cmp: ComponentType<P>): { default: ComponentType<P> } {
  return { default: Cmp };
}

/** Factory so a failed import can be remounted, and tests can inject a throwing loader. */
export function retryableLazy<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const make = () => lazy(load);
  let current = make();
  return class RetryableLazy extends Component<P & RetryableLazyProps, State> {
    state: State = { failed: false };
    private Body = current;

    static getDerivedStateFromError(): State {
      return { failed: true };
    }

    private retry = () => {
      if (this.Body === current) current = make();
      this.Body = current;
      this.setState({ failed: false });
    };

    render() {
      const {
        fallback = null,
        errorMessage,
        retryLabel,
        errorTestId = "lazy-chunk-error",
        retryTestId = "lazy-chunk-retry",
        ...rest
      } = this.props;
      if (this.state.failed) {
        return (
          <div className="lazy-chunk-error" role="alert" data-testid={errorTestId}>
            <p className="muted">{errorMessage}</p>
            <Button type="button" size="sm" onClick={this.retry} data-testid={retryTestId}>{retryLabel}</Button>
          </div>
        );
      }
      return <Suspense fallback={fallback}>{createElement(this.Body, rest as unknown as P)}</Suspense>;
    }
  };
}

type BoundaryProps = RetryableLazyProps & { children: ReactNode };

/** Error + Suspense boundary around already-mounted children (e.g. a hook that throws a locale chunk). */
export class RetryableBoundary extends Component<BoundaryProps, State & { gen: number }> {
  state = { failed: false, gen: 0 };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  private retry = () => {
    this.setState((s) => ({ failed: false, gen: s.gen + 1 }));
  };

  render() {
    const {
      fallback = null,
      errorMessage,
      retryLabel,
      errorTestId = "lazy-chunk-error",
      retryTestId = "lazy-chunk-retry",
      children,
    } = this.props;
    if (this.state.failed) {
      return (
        <div className="lazy-chunk-error" role="alert" data-testid={errorTestId}>
          <p className="muted">{errorMessage}</p>
          <Button type="button" size="sm" onClick={this.retry} data-testid={retryTestId}>{retryLabel}</Button>
        </div>
      );
    }
    return <Suspense fallback={fallback} key={this.state.gen}>{children}</Suspense>;
  }
}

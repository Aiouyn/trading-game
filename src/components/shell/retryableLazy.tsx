// Shared retry boundary around a lazy() chunk, same remount pattern as RetryableComposer:
// a failed import shows a short message and Retry, which builds a new lazy() generation
// instead of crashing the window.
"use client";
import { Component, createElement, createRef, lazy, Suspense, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type State = { failed: boolean };

export type RetryableLazyProps = {
  fallback?: ReactNode;
  errorMessage: string;
  retryLabel: string;
  errorTestId?: string;
  retryTestId?: string;
  /** Extra class on the error panel (e.g. touch-size Retry for a whole app body). */
  errorClassName?: string;
  /** With `focus: true`: the sr-only marker focused after Retry when the body has nothing focusable. */
  focusLabel?: string;
  focusTestId?: string;
};

/** Card 5: copy and test ids for a scoped Settings / Broker News chunk failure (was its own RetryableModule). */
export function scopedModuleProps(name: "settings" | "news", locale: string) {
  const fr = locale === "fr";
  const label = name === "settings" ? (fr ? "Réglages" : "Settings") : fr ? "Actualités" : "News";
  return {
    errorMessage: `${label} — ${fr ? "Chargement impossible." : "Couldn't load."}`,
    retryLabel: fr ? "Réessayer" : "Retry",
    errorTestId: `${name}-module-error`,
    errorClassName: "lazy-module-error",
    focusLabel: label,
    focusTestId: `${name}-module-focus`,
  } satisfies RetryableLazyProps;
}

/** After an explicit Retry, put focus on the recovered body's first control, but only if focus was lost (on body). */
function RecoveryFocus({ label, testId }: { label: string; testId: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (document.activeElement !== document.body) return;
    const first = marker.current?.parentElement?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]):not([aria-disabled="true"]), a[href]');
    (first ?? marker.current)?.focus();
  }, []);
  return <span ref={marker} tabIndex={-1} className="sr-only" data-testid={testId}>{label}</span>;
}

/** Wrap a named export so a dynamic import satisfies `{ default }`. */
export function asDefault<P extends object>(Cmp: ComponentType<P>): { default: ComponentType<P> } {
  return { default: Cmp };
}

type LazyState<P extends object> = { failed: boolean; body: ComponentType<P> | null };

/** Factory so a failed import can be remounted, and tests can inject a throwing loader.
 *  `focus: true` (card 5, Settings + Broker News): a failure moves lost focus to Retry, and a recovered body gets it back.
 *  `suspense: false` loads the chunk without React.lazy / Suspense, so a paused test clock
 *  cannot strand the panel behind React 19's ~300 ms Suspense reveal timer. The import itself
 *  still resolves on the real clock. */
export function retryableLazy<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  opts?: { suspense?: boolean; focus?: boolean },
) {
  const useSuspense = opts?.suspense !== false;
  const manageFocus = opts?.focus === true;
  const make = () => lazy(load);
  let current = useSuspense ? make() : null;
  return class RetryableLazy extends Component<P & RetryableLazyProps, LazyState<P>> {
    state: LazyState<P> = { failed: false, body: null };
    private Body = current;
    private pending: Promise<void> | null = null;
    private failure = createRef<HTMLDivElement>();
    private recovered = false;

    private focusFailure = () => {
      if (manageFocus && document.activeElement === document.body) this.failure.current?.querySelector("button")?.focus();
    };

    static getDerivedStateFromError(): Partial<LazyState<object>> {
      return { failed: true };
    }

    componentDidCatch() { this.focusFailure(); }

    componentDidMount() { this.ensure(); }
    componentDidUpdate() { this.ensure(); }

    private ensure = () => {
      if (useSuspense || this.state.failed || this.state.body || this.pending) return;
      this.pending = load().then(
        (m) => { this.pending = null; this.setState({ body: m.default, failed: false }); },
        () => { this.pending = null; this.setState({ failed: true }, this.focusFailure); },
      );
    };

    private retry = () => {
      this.recovered = manageFocus;
      if (useSuspense) {
        if (this.Body === current) current = make();
        this.Body = current;
        this.setState({ failed: false });
        return;
      }
      this.pending = null;
      this.setState({ failed: false, body: null }, () => this.ensure());
    };

    render() {
      const {
        fallback = null,
        errorMessage,
        retryLabel,
        errorTestId = "lazy-chunk-error",
        retryTestId = "lazy-chunk-retry",
        errorClassName,
        focusLabel = retryLabel,
        focusTestId = "lazy-chunk-focus",
        ...rest
      } = this.props;
      if (this.state.failed) {
        return (
          <div ref={this.failure} className={errorClassName ? `lazy-chunk-error ${errorClassName}` : "lazy-chunk-error"} role="alert" data-testid={errorTestId}>
            <p className="muted">{errorMessage}</p>
            <Button type="button" size="sm" onClick={this.retry} data-testid={retryTestId}>{retryLabel}</Button>
          </div>
        );
      }
      const marker = this.recovered ? <RecoveryFocus label={focusLabel} testId={focusTestId} /> : null;
      if (!useSuspense) {
        if (!this.state.body) return fallback;
        return <>{createElement(this.state.body, rest as unknown as P)}{marker}</>;
      }
      return <Suspense fallback={fallback}>{createElement(this.Body!, rest as unknown as P)}{marker}</Suspense>;
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

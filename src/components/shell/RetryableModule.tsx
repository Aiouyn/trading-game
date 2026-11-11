"use client";
import { Component, createElement, createRef, lazy, Suspense, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import "./retryableModule.css";

type ModuleName = "settings" | "news";
type Props<P extends object> = {
  name: ModuleName; locale: string;
  componentProps: P; fallback: ReactNode;
};
type State = { kind: "ready" | "failed" };

function RecoveryFocus({ recover, label, name }: { recover: boolean; label: string; name: ModuleName }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!recover || document.activeElement !== document.body) return;
    const first = marker.current?.parentElement?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]):not([aria-disabled="true"]), a[href]');
    (first ?? marker.current)?.focus();
  }, [recover]);
  return recover ? <span ref={marker} tabIndex={-1} className="sr-only" data-testid={`${name}-module-focus`}>{label}</span> : null;
}

export function retryableModule<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  // Share successful imports across mounts; retry replaces only the failed generation.
  let current = lazy(load);
  return class RetryableModule extends Component<Props<P>, State> {
    state: State = { kind: "ready" };
    private Body = current;
    private failure = createRef<HTMLDivElement>();
    private recover = false;
    static getDerivedStateFromError(): { kind: "failed" } { return { kind: "failed" }; }
    componentDidCatch() {
      if (document.activeElement === document.body) this.failure.current?.querySelector("button")?.focus();
    }
    private retry = () => {
      this.recover = true;
      if (this.Body === current) current = lazy(load);
      this.Body = current;
      this.setState({ kind: "ready" });
  };
  render() {
    const { name, locale, componentProps, fallback } = this.props;
    const fr = locale === "fr";
    const label = name === "settings" ? (fr ? "Réglages" : "Settings") : (fr ? "Actualités" : "News");
    if (this.state.kind === "failed") return (
      <div ref={this.failure} className="lazy-module-error" role="alert" data-testid={`${name}-module-error`}>
        <p className="muted">{`${label} — ${fr ? "Chargement impossible." : "Couldn't load."}`}</p>
        <Button onClick={this.retry}>{fr ? "Réessayer" : "Retry"}</Button>
      </div>
    );
    return <Suspense fallback={fallback}>
      {createElement(this.Body, componentProps)}
      <RecoveryFocus recover={this.recover} label={label} name={name} />
    </Suspense>;
  }
  };
}

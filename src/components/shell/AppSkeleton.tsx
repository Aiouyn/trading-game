"use client";
// Generic window skeleton (Studio Q3): the shell shows it while ANY built app's lazy chunk loads, so a built app never
// flashes "Coming later" (that copy is only for built:false apps). A title bar and three row bars on --win2, no motion,
// busy for AT with "Loading {App}…". An app may hand AppBody a closer first paint (Wire: WireLoading); this is the default.
import { APP_NAMES, appLoadingText } from "@/shell/strings";
import type { AppId } from "@/shell/registry";
import { useShell } from "./ShellContext";

export function AppSkeleton({ app }: { app: AppId }) {
  const locale = useShell((s) => s.prefs.locale);
  return (
    <section className="app-skel" data-testid="app-skeleton" data-app={app} aria-busy="true">
      <span className="sr-only" role="status">{appLoadingText(locale, APP_NAMES[app])}</span>
      <div className="app-skel-bar app-skel-title" aria-hidden="true" />
      {[0, 1, 2].map((k) => <div key={k} className="app-skel-bar" aria-hidden="true" data-testid="app-skeleton-row" />)}
    </section>
  );
}

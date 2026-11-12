// Wire loading skeleton: the feed's own loading state, and the Suspense fallback while the lazy Wire chunk loads
// (Studio ruling: a built app never flashes "Coming later"). This file must not import ./strings, or the shell's
// first-load graph would pull the whole Wire copy table onto /broker.
"use client";
import "./skeleton.css";

/** Boot-label for the shell fallback; kept here so AppBody does not import wire strings. */
export const WIRE_BOOT_LABEL = { en: "Loading Wire", fr: "Chargement du fil" } as const;
export const wireBootLabel = (locale: string) => locale === "fr" ? WIRE_BOOT_LABEL.fr : WIRE_BOOT_LABEL.en;

export function WireSkeletonList({ label }: { label: string }) {
  return (
    <ul className="wire-list" aria-busy="true" data-testid="wire-loading">
      <li className="sr-only">{label}</li>
      {[0, 1, 2].map((k) => <li key={k} className="wire-skel" aria-hidden="true" data-testid="wire-skeleton" />)}
    </ul>
  );
}

/** Suspense fallback for the Wire chunk: same container and skeleton as the feed's `loading` state. */
export function WireLoading({ label }: { label: string }) {
  return (
    <div className="wire" data-testid="wire-boot" data-state="loading">
      <div className="wire-body"><WireSkeletonList label={label} /></div>
    </div>
  );
}

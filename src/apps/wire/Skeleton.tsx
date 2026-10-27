// Wire loading skeleton: the feed's own loading state, and the Suspense fallback while the lazy Wire chunk loads
// (Studio ruling: a built app never flashes "Coming later"). Small and eager: imported by the shell's AppBody.
"use client";
import { useWireStrings } from "./strings";
import "./skeleton.css";

export function WireSkeletonList({ label }: { label: string }) {
  return (
    <ul className="wire-list" aria-busy="true" data-testid="wire-loading">
      <li className="sr-only">{label}</li>
      {[0, 1, 2].map((k) => <li key={k} className="wire-skel" aria-hidden="true" data-testid="wire-skeleton" />)}
    </ul>
  );
}

/** Suspense fallback for the Wire chunk: same container and skeleton as the feed's `loading` state. */
export function WireLoading() {
  const t = useWireStrings();
  return (
    <div className="wire" data-testid="wire-boot" data-state="loading">
      <div className="wire-body"><WireSkeletonList label={t.loading} /></div>
    </div>
  );
}

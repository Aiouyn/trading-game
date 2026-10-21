"use client";
// City placeholder window: the one seam with Spec 2 (Spec 1 §10, Spec 2 §2). Spec 1 never writes src/city/**.
// `@/city` resolves to src/city/index.ts (Spec 2); until it lands, next.config.ts points it at the stub.
import { useEffect, useRef, useState } from "react";
import type { CityOverlay, CityRenderer, Visibility } from "@/city";
import type { BodyState } from "@/components/shell/AppBody";
import { useShell } from "@/components/shell/ShellContext";
import { Button } from "@/components/ui/Button";
import { S } from "@/shell/strings";
import { recordPerf } from "@/shell/telemetry";
import { createShellCityRenderer } from "./createShellCityRenderer";
import { fetchChunk, stubCityChannel } from "./cityChannel";

/** The Settings "my city" toggle maps onto the renderer's overlay (Spec 2 §2 CityOverlay). */
const overlayOf = (myCityOverlay: boolean): CityOverlay => (myCityOverlay ? "my_places" : "none");

/** myPlaces arrives as a fresh array on every channel update; compare by content, not reference. */
export const samePlaces = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export const cityVisibility = (s: BodyState): Visibility => (s.hidden ? "hidden" : s.collapsed || s.background ? "background" : "visible");

function usePrefersReducedMotion(): boolean {
  const pref = useShell((s) => s.prefs.reducedMotion);
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setSystem(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return pref === "on" || (pref === "system" && system);
}

export function CityWindow({ state }: { state: BodyState }) {
  const ref = useRef<HTMLDivElement>(null);
  const renderer = useRef<CityRenderer | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumped by the window's own Retry: re-runs only the renderer effect below (never the shell loader).
  const [attempt, setAttempt] = useState(0);
  const appliedPlaces = useRef<readonly string[]>([]);
  const reducedMotion = usePrefersReducedMotion();
  const tierOverride = useShell((s) => s.local.renderTierOverride);
  const myCityOverlay = useShell((s) => s.local.myCityOverlay);
  const myPlaces = useShell((s) => s.channels.me.myPlaces);
  const visibility = cityVisibility(state);
  // Latest values for the async mount without re-creating the renderer. Anything changed while the
  // renderer loads is re-applied from here once it is ready (latest wins).
  const latest = useRef({ reducedMotion, visibility, myPlaces, tierOverride, myCityOverlay });
  useEffect(() => { latest.current = { reducedMotion, visibility, myPlaces, tierOverride, myCityOverlay }; });

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (disposed || !ref.current) return;
      const created = latest.current;
      let r: CityRenderer | null = null;
      try {
        r = await createShellCityRenderer({
          tierOverride: created.tierOverride, reducedMotion: created.reducedMotion, myCityOverlay: created.myCityOverlay,
          channel: stubCityChannel, fetchChunk, locale: document.documentElement.lang || "en",
          myEntityIds: created.myPlaces, onPerfSample: recordPerf,
        });
        if (disposed) { r.dispose(); return; }
        await r.mount(ref.current);
      } catch {
        // createCityRenderer or mount() rejected: show the shell's error state instead of loading forever.
        r?.dispose();
        if (!disposed) { setLoading(false); setFailed(true); }
        return;
      }
      if (disposed) { r.unmount(); r.dispose(); return; }
      // Re-apply only what changed while loading (setTier re-runs tier detection in the real renderer).
      const now = latest.current;
      r.setVisibility(now.visibility);
      if (now.reducedMotion !== created.reducedMotion) r.setReducedMotion(now.reducedMotion);
      if (now.tierOverride !== created.tierOverride) r.setTier(now.tierOverride);
      if (now.myCityOverlay !== created.myCityOverlay) r.setOverlay(overlayOf(now.myCityOverlay));
      if (!samePlaces(now.myPlaces, created.myPlaces)) r.setMyPlaces(now.myPlaces);
      appliedPlaces.current = now.myPlaces;
      renderer.current = r;
      setLoading(false);
    })();
    return () => {
      disposed = true;
      renderer.current?.unmount();
      renderer.current?.dispose();
      renderer.current = null;
    };
    // The renderer is created once per window (and again per Retry); later changes go through its setters.
  }, [attempt]);

  useEffect(() => { renderer.current?.setVisibility(visibility); }, [visibility]);
  useEffect(() => { renderer.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);
  useEffect(() => { renderer.current?.setTier(tierOverride); }, [tierOverride]);
  useEffect(() => {
    const r = renderer.current;
    if (!r || samePlaces(appliedPlaces.current, myPlaces)) return;
    r.setMyPlaces(myPlaces);
    appliedPlaces.current = myPlaces;
  }, [myPlaces]);
  useEffect(() => { renderer.current?.setOverlay(overlayOf(myCityOverlay)); }, [myCityOverlay]);

  return (
    <div className="city-body" data-testid="city-body" data-visibility={visibility}>
      {loading && <p className="muted city-loading">{S.loadingCity}</p>}
      {/* The shell's existing error message ("Couldn't load"), in the loading slot, in a role=alert region. */}
      {failed && (
        <div className="city-loading city-failed">
          <p className="muted" role="alert" data-testid="city-error">{S.couldntLoad}</p>
          {/* Studio: the window's own secondary Retry disposes/re-creates only the CityRenderer.
              TODO(View as table): once table data is loaded, render <Button variant="ghost" size="sm"> "View as table"
              BESIDE Retry (same row). No table data source exists yet, so it stays hidden. */}
          <Button variant="secondary" size="sm" data-testid="city-retry" onClick={() => { setFailed(false); setLoading(true); setAttempt((n) => n + 1); }}>{S.retry}</Button>
        </div>
      )}
      <div ref={ref} className="city-mount" data-testid="city-mount" />
    </div>
  );
}

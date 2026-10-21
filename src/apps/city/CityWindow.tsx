"use client";
// City placeholder window: the one seam with Spec 2 (Spec 1 §10, Spec 2 §2). Spec 1 never writes src/city/**.
// `@/city` resolves to src/city/index.ts (Spec 2); until it lands, next.config.ts points it at the stub.
import { useEffect, useRef, useState } from "react";
import type { CityOverlay, CityRenderer, Visibility } from "@/city";
import type { BodyState } from "@/components/shell/AppBody";
import { useShell } from "@/components/shell/ShellContext";
import { S } from "@/shell/strings";
import { recordPerf } from "@/shell/telemetry";
import { createShellCityRenderer } from "./createShellCityRenderer";
import { fetchChunk, stubCityChannel } from "./cityChannel";

/** The Settings "my city" toggle maps onto the renderer's overlay (Spec 2 §2 CityOverlay). */
const overlayOf = (myCityOverlay: boolean): CityOverlay => (myCityOverlay ? "my_places" : "none");

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
      const r = await createShellCityRenderer({
        tierOverride: created.tierOverride, reducedMotion: created.reducedMotion, myCityOverlay: created.myCityOverlay,
        channel: stubCityChannel, fetchChunk, locale: document.documentElement.lang || "en",
        myEntityIds: created.myPlaces, onPerfSample: recordPerf,
      });
      if (disposed) { r.dispose(); return; }
      await r.mount(ref.current);
      if (disposed) { r.unmount(); r.dispose(); return; }
      // Re-apply only what changed while loading (setTier re-runs tier detection in the real renderer).
      const now = latest.current;
      r.setVisibility(now.visibility);
      if (now.reducedMotion !== created.reducedMotion) r.setReducedMotion(now.reducedMotion);
      if (now.tierOverride !== created.tierOverride) r.setTier(now.tierOverride);
      if (now.myCityOverlay !== created.myCityOverlay) r.setOverlay(overlayOf(now.myCityOverlay));
      if (now.myPlaces !== created.myPlaces) r.setMyPlaces(now.myPlaces);
      renderer.current = r;
      setLoading(false);
    })();
    return () => {
      disposed = true;
      renderer.current?.unmount();
      renderer.current?.dispose();
      renderer.current = null;
    };
    // The renderer is created once per window; later changes go through its setters (effects below).
  }, []);

  useEffect(() => { renderer.current?.setVisibility(visibility); }, [visibility]);
  useEffect(() => { renderer.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);
  useEffect(() => { renderer.current?.setTier(tierOverride); }, [tierOverride]);
  useEffect(() => { renderer.current?.setMyPlaces(myPlaces); }, [myPlaces]);
  useEffect(() => { renderer.current?.setOverlay(overlayOf(myCityOverlay)); }, [myCityOverlay]);

  return (
    <div className="city-body" data-testid="city-body" data-visibility={visibility}>
      {loading && <p className="muted city-loading">{S.loadingCity}</p>}
      <div ref={ref} className="city-mount" data-testid="city-mount" />
    </div>
  );
}

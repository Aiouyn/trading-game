"use client";
// City placeholder window: the one seam with Spec 2 (Spec 1 §10). Spec 1 never writes src/city/**.
// `@/city` resolves to src/city/index.ts (Spec 2). Until it lands, next.config.ts and tsconfig
// fall back to the type-only stub in tests/unit/shell/__mocks__/city.ts.
import { useEffect, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import type { BodyState } from "@/components/shell/AppBody";
import { S } from "@/shell/strings";

export function CityWindow({ state }: { state: BodyState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const reducedMotion = useShell((s) => s.prefs.reducedMotion);
  const tier = useShell((s) => s.local.renderTierOverride);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const mod = await import("@/city");
      if (disposed || !ref.current) return;
      const r = await mod.createCityRenderer({ cityId: "port-avalon", prefs: { reducedMotion, tier } });
      if (disposed) { r.dispose(); return; }
      r.mount(ref.current);
      setLoading(false);
      cleanup = () => { r.unmount(); r.dispose(); };
    })();
    return () => { disposed = true; cleanup?.(); };
  }, [reducedMotion, tier]);

  return (
    <div className="city-body" data-focused={state.focused} data-collapsed={state.collapsed} data-background={state.background}>
      {loading && <p className="muted city-loading">{S.loadingCity}</p>}
      <div ref={ref} className="city-mount" data-testid="city-mount" />
    </div>
  );
}

// Harness driver for city.html (fixture city, test hooks). C-05 no longer uses it: the seam is
// checked against Spec 1's real src/apps/city/CityWindow.tsx (citywindow.html, diagnostics.spec).
import type { CityChannelClient, CityRenderer, CityTier, PerfSample, PickResult, Visibility } from '@/city';

export interface WindowShimOptions {
  container: HTMLElement;
  cityId: string;
  channel: CityChannelClient;
  fetchChunk: (url: string) => Promise<ArrayBuffer>;
  tierOverride: 'auto' | CityTier;
  reducedMotion: boolean;
  myEntityIds: string[];
  onPick: (p: PickResult) => void;
  onPerfSample?: (s: PerfSample) => void;
}

export async function openCityWindow(o: WindowShimOptions): Promise<CityRenderer> {
  const { createCityRenderer } = await import('@/city');
  const r = await createCityRenderer({
    cityId: o.cityId,
    tierOverride: o.tierOverride,
    reducedMotion: o.reducedMotion,
    myCityOverlay: false,
    channel: o.channel,
    fetchChunk: o.fetchChunk,
    locale: 'en-US',
    myEntityIds: o.myEntityIds,
    onPerfSample: o.onPerfSample,
  });
  r.onPick(o.onPick);
  r.onTierChange(() => undefined);
  await r.mount(o.container);
  return r;
}

/** Calls the rest of the interface so every signature is type-checked against a consumer. */
export function exerciseSeam(r: CityRenderer, v: Visibility): void {
  r.setVisibility(v);
  r.setReducedMotion(false);
  r.setOverlay('none');
  r.setMyPlaces(['x']);
  r.setTimeOfDay(1110);
  r.setTier('auto');
  const t: { tier: CityTier } = r.getTier();
  void t;
  r.focus({ entityId: 'x' });
  r.focus({ parcelId: 'x' });
  r.openTable();
  r.closeTable();
  const d = r.diagnostics();
  void d.framesWhileHidden;
}

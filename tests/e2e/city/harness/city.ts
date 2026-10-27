// City e2e harness page. Query params:
//   tier=auto|T0|T1|T2   reduced=1   mine=1   slowclock=1 (injected 25 fps frame clock)
//   clock=HH:MM (card 2 §2.3: game time of day, via renderer.setTimeOfDay; E2E builds only)
//   clock=<tick> (a bare number: game clock tick, for the "update pending" lag check)
import type { CityDelta, CityRenderer, PerfSample, PickResult, Visibility } from '@/city';
import { manifestUrl } from '@/city/data/urls';
import { openCityWindow } from './CityWindowShim';

interface FixtureInfo {
  cityId: string;
  mine: string[];
  versions: number[];
}

const q = new URLSearchParams(location.search);
// card 1 AC 10: high contrast / colour-blind modes, as the app sets them on <html>
if (q.get('hc') === '1') document.documentElement.dataset.hc = '1';
if (q.get('cb') === '1') document.documentElement.dataset.cb = '1';
const info = (await (await fetch('/fixture-info.json')).json()) as FixtureInfo;
const cityId = info.cityId;
const fetchLog: string[] = [];
const picks: PickResult[] = [];
const perf: PerfSample[] = [];
const subs = new Set<(d: CityDelta) => void>();
let stamp: number | null = 1;
const clockHHMM = /^(\d{1,2}):(\d{2})$/.exec(q.get('clock') ?? '');
let clockTick: number | null = q.has('clock') && !clockHHMM ? Number(q.get('clock')) : null;
let subscribeCalls = 0;

const channel = {
  subscribe(id: string, cb: (d: CityDelta) => void) {
    subscribeCalls++;
    void id;
    subs.add(cb);
    return () => subs.delete(cb);
  },
  stateVersion: () => stamp,
  // not on the seam yet (proposal): the game clock tick for the publication-lag check
  clockTick: () => clockTick,
};
// The CDN serves one mutable manifest; the harness serves the manifest of the current stamp.
const fetchChunk = async (url: string) => {
  fetchLog.push(url);
  const real = url === manifestUrl(cityId) ? `/city/${cityId}/manifest.v${stamp}.json` : url;
  const r = await fetch(real);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.arrayBuffer();
};

const tier = (q.get('tier') ?? 'auto') as 'auto' | 'T0' | 'T1' | 'T2';
const reducedMotion = q.get('reduced') === '1';
const myEntityIds = q.get('mine') === '1' ? info.mine : [];
const container = document.getElementById('app')!;

let renderer: CityRenderer;
if (q.get('slowclock') === '1') {
  // 17-AT-24: injected frame-time source giving 25 fps (40 ms per frame).
  let t = 0;
  const { createRenderer } = await import('@/city/renderer/create');
  renderer = await createRenderer(
    { cityId, tierOverride: tier, reducedMotion, myCityOverlay: false, channel, fetchChunk, locale: 'en-US', myEntityIds, onPerfSample: (s) => perf.push(s) },
    { frameClock: () => (t += 40), expose: true },
  );
  renderer.onPick((p) => picks.push(p));
  await renderer.mount(container);
} else {
  renderer = await openCityWindow({ container, cityId, channel, fetchChunk, tierOverride: tier, reducedMotion, myEntityIds, onPick: (p) => picks.push(p), onPerfSample: (s) => perf.push(s) });
}

// card 2 ruling 4: the clock ACs drive the time of day through the public seam, E2E builds only
if (process.env.NEXT_PUBLIC_CITY_E2E === '1' && clockHHMM) renderer.setTimeOfDay(Number(clockHHMM[1]) * 60 + Number(clockHHMM[2]));

const harness = {
  renderer,
  picks,
  perf,
  fetchLog,
  info,
  subscribeCalls: () => subscribeCalls,
  subscribers: () => subs.size,
  setVisibility: (v: Visibility) => renderer.setVisibility(v),
  /** Server publishes a new version: the stamp moves and subscribers are told. */
  publish(d: CityDelta) {
    stamp = d.stateVersion;
    for (const cb of subs) cb(d);
  },
  setStamp(v: number) {
    stamp = v;
  },
  setTimeOfDay: (minute: number) => renderer.setTimeOfDay(minute),
  setClock(t: number | null) {
    clockTick = t;
  },
  manifestUrl: () => manifestUrl(cityId),
};
(window as unknown as { harness: typeof harness }).harness = harness;
document.body.dataset.ready = '1';

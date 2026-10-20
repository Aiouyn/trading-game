// City e2e harness page. Query params:
//   tier=auto|T0|T1|T2   reduced=1   mine=1   slowclock=1 (injected 25 fps frame clock)
import type { CityDelta, CityRenderer, PickResult, Visibility } from '@/city';
import { snapshotUrl } from '@/city/data/urls';
import { openCityWindow } from './CityWindowShim';

const q = new URLSearchParams(location.search);
const cityId = 'port-avalon';
const fetchLog: string[] = [];
const picks: PickResult[] = [];
const subs = new Set<(d: CityDelta) => void>();
let stamp: number | null = 1;
let subscribeCalls = 0;

const channel = {
  subscribe(id: string, cb: (d: CityDelta) => void) {
    subscribeCalls++;
    void id;
    subs.add(cb);
    return () => subs.delete(cb);
  },
  stateVersion: () => stamp,
};
const fetchChunk = async (url: string) => {
  fetchLog.push(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.arrayBuffer();
};

const tier = (q.get('tier') ?? 'auto') as 'auto' | 'T0' | 'T1' | 'T2';
const reducedMotion = q.get('reduced') === '1';
const myEntityIds = q.get('mine') === '1' ? ['e5', 'e40', 'e41'] : [];
const container = document.getElementById('app')!;

let renderer: CityRenderer;
if (q.get('slowclock') === '1') {
  // 17-AT-24: injected frame-time source giving 25 fps (40 ms per frame).
  let t = 0;
  const { createRenderer } = await import('@/city/renderer/create');
  renderer = await createRenderer(
    { cityId, tierOverride: tier, reducedMotion, myCityOverlay: false, channel, fetchChunk, locale: 'en-US', myEntityIds },
    { frameClock: () => (t += 40), expose: true },
  );
  renderer.onPick((p) => picks.push(p));
  await renderer.mount(container);
} else {
  renderer = await openCityWindow({ container, cityId, channel, fetchChunk, tierOverride: tier, reducedMotion, myEntityIds, onPick: (p) => picks.push(p) });
}

const harness = {
  renderer,
  picks,
  fetchLog,
  subscribeCalls: () => subscribeCalls,
  subscribers: () => subs.size,
  setVisibility: (v: Visibility) => renderer.setVisibility(v),
  /** Server publishes a new version: the stamp moves and subscribers get the delta. */
  publish(d: CityDelta) {
    stamp = d.stateVersion;
    for (const cb of subs) cb(d);
  },
  setStamp(v: number) {
    stamp = v;
  },
  snapshotUrl: (v: number) => snapshotUrl(cityId, v),
};
(window as unknown as { harness: typeof harness }).harness = harness;
document.body.dataset.ready = '1';

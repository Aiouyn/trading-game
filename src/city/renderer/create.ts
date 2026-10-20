import type * as THREE_NS from 'three';
import type {
  CityDiagnostics,
  CityOverlay,
  CityRenderer,
  CityRendererOptions,
  CityTier,
  PickResult,
  TierReason,
  Visibility,
} from '../index';
import type { CityDelta, CitySnapshot } from '../data/types';
import { CityStore } from '../data/store';
import { snapshotUrl } from '../data/urls';
import { buildRamps, type Ramps } from '../art/ramps';
import { deltaE as deltaE76 } from '../art/color';
import { readTokens, cssVar } from '../art/tokens';
import { createDecodeClient, type DecodeClient } from '../worker/client';
import type { DecodedChunk } from '../worker/decode';
import { FLOATS_PER_PART } from '../worker/format';
import { createTableView, type TableView } from '../table/table';
import { createChrome, type Chrome } from '../chrome/chrome';
import { FrameStats, heapMb, type UiPerfSample } from '../diagnostics/perf';
import { autoStep, initialTier, isBatterySaver, measureFps, readBattery, MEASURE_MS } from '../tiers/select';
import { clampZoom, panGround, rotate, type CameraState } from './camera';
import { RenderLoop, browserScheduler, type Scheduler } from './loop';
import { CityScene, type GroundData, type SceneConfig } from './scene';
import { buildModel, entityAnchor, type CityModel } from './model';
import { partColors } from './overlay';
import { pickParts } from './pick';
import { lightAt, litRatio, DEFAULT_GAME_MINUTE } from './light';
import { drawPicture } from './picture';
import { GROUND_FRAG, GROUND_VERT, PART_FRAG, PART_VERT } from './shaders';

/** Test-only seams. createCityRenderer (the public seam) never passes these. */
export interface InternalHooks {
  /** Frame-time source for the 2 s tier measurement (17-AT-24 test). */
  frameClock?: () => number;
  scheduler?: Scheduler;
  /** Expose window.__city (dev/e2e builds, spec §9). */
  expose?: boolean;
  perfIntervalMs?: number;
}

export interface CityTestApi {
  diagnostics: () => CityDiagnostics;
  rafPending: () => boolean;
  uploads: () => number;
  snapshotFetches: () => number;
  chunkFetches: () => number;
  pickableIds: () => string[];
  tableRows: () => { kind: string; entityId: string; parcelId: string; name: string; mine: boolean }[];
  anchorOf: (entityId: string) => { x: number; y: number } | null;
  camera: () => CameraState;
  setCamera: (c: Partial<CameraState>) => void;
  /** Normal frame + mask frame, compared in-page: counts of brass pixels inside/outside the mask. */
  brassCheck: (deltaE: number) => { brass: number; outside: number; maskPixels: number } | null;
  /** Forces continuous rendering with a moving camera for `ms`; returns rAF intervals and CPU ms. */
  benchmark: (ms: number) => Promise<{ intervals: number[]; cpu: number[] }>;
  perfSamples: () => UiPerfSample[];
  decodeMs: () => number;
  decodeInWorker: () => boolean;
}

const TIER_CONFIG: Record<'T1' | 'T2', { dprCap: number; maxPixels: number; nearRing: number; boats: boolean }> = {
  T2: { dprCap: 1.5, maxPixels: 2_400_000, nearRing: Infinity, boats: true },
  T1: { dprCap: 1.0, maxPixels: 2_000_000, nearRing: 220, boats: false },
};

const LONG_PRESS_MS = 500;
const TAP_SLOP_PX = 6;
const TWEEN_MS = 350;
const PERF_INTERVAL_MS = 60_000;
/** window.__city is exposed in dev and e2e builds only (spec §9). Both are build-time constants. */
const DEV_OR_E2E = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_CITY_E2E === '1';

export async function createRenderer(opts: CityRendererOptions, hooks: InternalHooks = {}): Promise<CityRenderer> {
  const sched = hooks.scheduler ?? browserScheduler();
  const frameClock = hooks.frameClock ?? (() => performance.now());
  const store = new CityStore();
  const decoded = new Map<string, DecodedChunk>();
  const decoder: DecodeClient = createDecodeClient();
  const stats = new FrameStats();
  const pickCbs = new Set<(p: PickResult) => void>();
  const tierCbs = new Set<(t: CityTier, r: TierReason) => void>();
  const perfSamples: UiPerfSample[] = [];
  const mine = new Set(opts.myEntityIds ?? []);

  let override = opts.tierOverride;
  let reducedMotion = opts.reducedMotion;
  let overlay: CityOverlay = 'none';
  let gameMinute = DEFAULT_GAME_MINUTE;
  let tier: CityTier = 'T2';
  let reason: TierReason = 'initial';
  let disposed = false;
  let mounted = false;
  let tierGen = 0;

  let chrome: Chrome | null = null;
  let table: TableView | null = null;
  let ramps: Ramps | null = null;
  let THREE: typeof THREE_NS | null = null;
  let scene: CityScene | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let img: HTMLImageElement | null = null;
  let resizeObs: ResizeObserver | null = null;
  let lastSceneInfo = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0, gpuBytes: 0 };

  let ground: GroundData | null = null;
  let groundUrl: string | null = null;
  let model: CityModel | null = null;
  let colors: { colors: Float32Array; flat: Uint8Array } | null = null;

  let unsubscribe: (() => void) | null = null;
  let pendingFetch = false;
  let snapshotInflight: number | null = null;
  let snapshotFetches = 0;
  let chunkFetches = 0;
  let perfTimer: number | null = null;

  let cam: CameraState = { target: [0, 0], rotation: 0, zoom: 1 };
  let tween: { from: CameraState; to: CameraState; t0: number } | null = null;
  let baseHalf = 400;

  const t0 = performance.now();
  const loadMs = { importThree: 0, firstChunk: 0, firstFrame: 0 };
  let partsDrawn = false;
  let measuring = false;
  let measureStamps: number[] = [];
  let fpsFirst2s: number | null = null;
  let benchmarkUntil = 0;
  let benchmarkOut: { intervals: number[]; cpu: number[] } | null = null;
  let benchmarkLast = 0;

  // ---------- render loop ----------
  const loop = new RenderLoop(sched, {
    draw(now, continuous) {
      if (!scene || !chrome) return;
      const w = chrome.stage.clientWidth, h = chrome.stage.clientHeight;
      scene.setCamera(cam, w, h, baseHalf);
      scene.setTime(now / 1000);
      const c0 = performance.now();
      scene.render();
      const cpu = performance.now() - c0;
      stats.frame(now, cpu, continuous);
      if (benchmarkOut) {
        if (benchmarkLast) benchmarkOut.intervals.push(now - benchmarkLast);
        benchmarkOut.cpu.push(cpu);
        benchmarkLast = now;
      }
      lastSceneInfo = scene.info();
      placeLabels();
      if (model && model.parts.length && !partsDrawn) {
        partsDrawn = true;
        loadMs.firstFrame = performance.now() - t0;
        startMeasurement();
        loop.wake(); // ambient life (T2) starts once the city is on screen
      }
      if (measuring) {
        measureStamps.push(frameClock());
        const fps = measureFps(measureStamps);
        if (fps !== null) {
          measuring = false;
          fpsFirst2s = fps;
          loop.endContinuous();
          if (override === 'auto') {
            const next = autoStep(tier, fps);
            if (next !== tier) void enterTier(next, 'auto-fps');
          }
        }
      }
    },
    animate(now) {
      let moving = false;
      if (tween) {
        const k = Math.min(1, (now - tween.t0) / TWEEN_MS);
        const e = k * k * (3 - 2 * k);
        cam = {
          rotation: tween.to.rotation,
          zoom: tween.from.zoom + (tween.to.zoom - tween.from.zoom) * e,
          target: [
            tween.from.target[0] + (tween.to.target[0] - tween.from.target[0]) * e,
            tween.from.target[1] + (tween.to.target[1] - tween.from.target[1]) * e,
          ],
        };
        if (k >= 1) tween = null;
        else moving = true;
      }
      if (now < benchmarkUntil) {
        cam = { ...cam, target: [Math.sin(now / 900) * baseHalf * 0.3, Math.cos(now / 1100) * baseHalf * 0.3] };
        moving = true;
      }
      const ambient = tier === 'T2' && !reducedMotion && scene !== null && partsDrawn;
      return moving || ambient;
    },
    onBackgroundLong() {
      setSubscribed(false);
    },
    onVisible() {
      if (!mounted) return;
      setSubscribed(true);
      const stamp = opts.channel.stateVersion(opts.cityId);
      if (stamp !== null && stamp !== store.stateVersion) void fetchSnapshot(stamp);
      else if (pendingFetch) void ensureChunks();
    },
    onIdle() {
      stats.pause();
    },
  });

  function startMeasurement(): void {
    if (override !== 'auto' || tier !== 'T2' || fpsFirst2s !== null) return;
    measuring = true;
    measureStamps = [];
    loop.forceContinuous(sched.now() + MEASURE_MS * 4); // ends as soon as the 2 s window is full
  }

  // ---------- data ----------
  function setSubscribed(on: boolean): void {
    if (on && !unsubscribe && !disposed) {
      unsubscribe = opts.channel.subscribe(opts.cityId, onDelta);
    } else if (!on && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  function onDelta(d: CityDelta): void {
    if (loop.state !== 'visible') {
      pendingFetch = true; // stamp moved; fetch when visible again
      return;
    }
    setData(d);
  }

  function visible(): boolean {
    return mounted && !disposed && loop.state === 'visible';
  }

  async function fetchSnapshot(version: number): Promise<void> {
    if (snapshotInflight === version) return;
    if (!visible()) {
      pendingFetch = true;
      return;
    }
    snapshotInflight = version;
    try {
      snapshotFetches++;
      const buf = await opts.fetchChunk(snapshotUrl(opts.cityId, version));
      const snap = JSON.parse(new TextDecoder().decode(buf)) as CitySnapshot;
      if (!disposed) setData(snap);
    } catch (err) {
      console.warn('[city] snapshot fetch failed', err);
    } finally {
      snapshotInflight = null;
    }
  }

  function setData(input: CitySnapshot | CityDelta): void {
    if (disposed || input.cityId !== opts.cityId) return;
    const r = store.apply(input);
    if (r.status === 'needs-snapshot') {
      void fetchSnapshot(input.stateVersion);
      return;
    }
    if (r.status !== 'applied') return;
    const s = store.snapshot!;
    chrome?.setPending(s.lagTicks > 0 ? 'City update pending' : null);
    table?.update(s, mine);
    if (r.changedChunks.length === 0 && !r.full && model) {
      rebuildModel(); // entity changes only
      return;
    }
    void ensureChunks();
  }

  async function ensureChunks(): Promise<void> {
    const s = store.snapshot;
    if (!s) return;
    if (!visible()) {
      pendingFetch = true;
      return;
    }
    pendingFetch = false;
    const version = s.stateVersion;
    const jobs: Promise<unknown>[] = [];
    if (groundUrl !== s.ground.url) {
      const url = s.ground.url;
      jobs.push(
        opts.fetchChunk(url).then((buf) => {
          chunkFetches++;
          ground = { mask: new Uint8Array(buf), size: s.ground.size, extent: s.extent };
          groundUrl = url;
        }),
      );
    }
    for (const ref of s.chunks) {
      if (decoded.has(ref.hash)) continue;
      jobs.push(
        opts.fetchChunk(ref.url).then(async (buf) => {
          chunkFetches++;
          decoded.set(ref.hash, await decoder.decode(buf));
        }),
      );
    }
    try {
      await Promise.all(jobs);
    } catch (err) {
      console.warn('[city] chunk fetch failed', err);
      return;
    }
    if (disposed || store.stateVersion !== version) return;
    const live = new Set(s.chunks.map((c) => c.hash));
    for (const h of decoded.keys()) if (!live.has(h)) decoded.delete(h);
    if (!loadMs.firstChunk) loadMs.firstChunk = performance.now() - t0;
    rebuildModel(true);
  }

  function rebuildModel(geometryChanged = false): void {
    const s = store.snapshot;
    if (!s || !ramps) return;
    if (geometryChanged || !model) {
      model = buildModel(s, decoded);
      baseHalf = s.extent * 0.75;
    }
    recolor(geometryChanged);
  }

  function recolor(upload: boolean): void {
    const s = store.snapshot;
    if (!s || !model || !ramps) return;
    colors = partColors(
      { entity: model.entity, style: model.style, entities: s.entities, districts: s.districts, mine, overlay, myCityOverlay: opts.myCityOverlay },
      ramps,
    );
    if (scene) {
      if (upload) {
        if (ground) scene.setGround(ground);
        scene.setParts({ parts: model.parts, colors: colors.colors, flat: colors.flat, entity: model.entity }, isWater);
      } else scene.setColors(colors.colors, colors.flat);
      applyLight();
      buildLabels();
      loop.invalidate();
    } else if (tier === 'T0') {
      drawT0();
    }
  }

  function isWater(x: number, z: number): boolean {
    if (!ground) return false;
    const { size, extent, mask } = ground;
    const i = Math.floor(((x + extent) / (2 * extent)) * size);
    const j = Math.floor(((z + extent) / (2 * extent)) * size);
    if (i < 0 || j < 0 || i >= size || j >= size) return false;
    return mask[j * size + i] === 0;
  }

  function applyLight(): void {
    if (!scene || !ramps) return;
    const l = lightAt(gameMinute, ramps);
    scene.setLight({ ...l, litRatio: litRatio(store.snapshot?.dayReturn ?? 0) });
  }

  // ---------- tiers ----------
  async function decideTier(): Promise<{ tier: CityTier; reason: TierReason }> {
    if (override !== 'auto') return initialTier({ override, hasWebGL2: true, batterySaver: false });
    const battery = isBatterySaver(await readBattery(navigator));
    if (battery) {
      // Report no-webgl2 first when the browser has no WebGL2 at all (order of evaluation, spec §3).
      const has = typeof WebGL2RenderingContext !== 'undefined';
      return initialTier({ override, hasWebGL2: has, batterySaver: true });
    }
    return { tier: 'T2', reason: 'initial' };
  }

  async function enterTier(next: CityTier, why: TierReason): Promise<void> {
    if (!chrome || !ramps || disposed) return;
    const gen = ++tierGen;
    const prev = tier;
    if (next === 'T0') {
      teardown3D();
      tier = 'T0';
      reason = why;
      chrome.setTierStyle(true);
      drawT0();
    } else {
      if (!scene) {
        const cv = document.createElement('canvas');
        Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', outline: 'none' });
        cv.tabIndex = 0;
        cv.setAttribute('aria-label', 'City map. Arrow keys pan, plus and minus zoom, brackets rotate.');
        const gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
        if (!gl) {
          if (gen === tierGen) await enterTier('T0', 'no-webgl2');
          return;
        }
        if (!THREE) {
          const i0 = performance.now();
          THREE = await import('three');
          loadMs.importThree = performance.now() - i0;
        }
        if (gen !== tierGen || disposed || !chrome) return;
        img?.remove();
        img = null;
        canvas = cv;
        chrome.stage.append(cv);
        cv.addEventListener('webglcontextlost', onContextLost);
        bindInput(cv);
        scene = new CityScene(THREE, cv, gl, ramps, sceneConfig(next));
        scene.setShaders({ partVert: PART_VERT, partFrag: PART_FRAG, groundVert: GROUND_VERT, groundFrag: GROUND_FRAG });
        tier = next;
        reason = why;
        resize();
        if (model) recolor(true);
      } else {
        tier = next;
        reason = why;
        scene.applyConfig(sceneConfig(next));
        resize();
      }
      chrome.setTierStyle(false);
      loop.invalidate();
    }
    if (prev !== tier || why !== 'initial') for (const cb of tierCbs) cb(tier, reason);
  }

  function sceneConfig(t: 'T1' | 'T2'): SceneConfig {
    const c = TIER_CONFIG[t];
    return { dpr: currentDpr(t), nearRing: c.nearRing, boats: c.boats };
  }

  function currentDpr(t: 'T1' | 'T2'): number {
    const c = TIER_CONFIG[t];
    const w = chrome?.stage.clientWidth || 1, h = chrome?.stage.clientHeight || 1;
    return Math.min(window.devicePixelRatio || 1, c.dprCap, Math.sqrt(c.maxPixels / (w * h)));
  }

  function onContextLost(e: Event): void {
    e.preventDefault();
    void enterTier('T0', 'context-lost');
  }

  function teardown3D(): void {
    if (scene) {
      scene.dispose();
      lastSceneInfo = { ...scene.info(), drawCalls: 0, triangles: 0 };
      scene = null;
    }
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.remove();
      canvas = null;
    }
    measuring = false;
    loop.endContinuous();
  }

  function drawT0(): void {
    if (!chrome || !ramps || tier !== 'T0') return;
    const s = store.snapshot;
    if (!img) {
      img = document.createElement('img');
      Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain' });
      chrome.stage.append(img);
    }
    img.alt = s ? `Picture of ${opts.cityId}. Use View as table to browse the city.` : 'City picture loading';
    if (!s || !model || !colors) return;
    img.src = drawPicture({
      width: chrome.stage.clientWidth,
      height: chrome.stage.clientHeight,
      extent: s.extent,
      ground,
      parts: model.parts,
      colors: colors.colors,
      flat: colors.flat,
      ramps,
    });
  }

  // ---------- labels, picking, input ----------
  let labelEls: { el: HTMLButtonElement; pos: [number, number, number] }[] = [];
  function buildLabels(): void {
    if (!chrome) return;
    chrome.labels.replaceChildren();
    labelEls = [];
    for (const d of store.snapshot?.districts ?? []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'city-district-label';
      b.textContent = d.name;
      Object.assign(b.style, {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
        background: 'none',
        border: '0',
        padding: '2px 4px',
        color: cssVar('fg'),
        opacity: '0.72',
        font: '18px/1 var(--font-instrument-serif, "Instrument Serif", serif)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      });
      b.addEventListener('click', () => emitPick(districtPick(d.id)));
      chrome.labels.append(b);
      labelEls.push({ el: b, pos: [d.center[0], 30, d.center[1]] });
    }
  }

  function placeLabels(): void {
    if (!scene || !chrome) return;
    const w = chrome.stage.clientWidth, h = chrome.stage.clientHeight;
    for (const l of labelEls) {
      const p = scene.project(l.pos, w, h);
      l.el.style.left = `${p.x}px`;
      l.el.style.top = `${p.y}px`;
    }
  }

  function districtPick(id: string): PickResult {
    const d = store.snapshot?.districts.find((x) => x.id === id);
    const screen = d && scene && chrome ? scene.project([d.center[0], 30, d.center[1]], chrome.stage.clientWidth, chrome.stage.clientHeight) : { x: 0, y: 0 };
    return { kind: 'district', entityId: id, parcelId: id, screen: round(screen) };
  }

  function anchorScreen(entityId: string): { x: number; y: number } | null {
    const s = store.snapshot;
    if (!s || !model) return null;
    if (s.districts.some((d) => d.id === entityId)) return districtPick(entityId).screen;
    const ei = model.entityIndex.get(entityId);
    if (ei === undefined) return null;
    const a = entityAnchor(model, ei);
    if (!a) return null;
    if (!scene || !chrome) return { x: 0, y: 0 }; // T0: no projection on a static picture
    return round(scene.project(a, chrome.stage.clientWidth, chrome.stage.clientHeight));
  }

  function entityPick(ei: number): PickResult {
    const e = store.snapshot!.entities[ei];
    return { kind: e.kind, entityId: e.id, parcelId: e.parcelId, screen: anchorScreen(e.id) ?? { x: 0, y: 0 } };
  }

  function emitPick(p: PickResult): void {
    for (const cb of pickCbs) cb(p);
  }

  function select(ei: number): void {
    if (!scene || !model) return;
    const boxes = (model.partsOf.get(ei) ?? []).map((i) => {
      const o = i * FLOATS_PER_PART;
      const p = model!.parts;
      return { x: p[o], z: p[o + 1], w: p[o + 2], d: p[o + 3], y0: p[o + 4], h: p[o + 5] };
    });
    scene.setSelection(ei >= 0 ? boxes : []);
    loop.invalidate();
  }

  // Tapping the same spot again picks the next entity behind (buildings hidden by taller ones
  // stay reachable on the map, CTY-05 / C-02).
  let lastTap: { x: number; y: number; hits: number[]; at: number } | null = null;
  function pickAt(x: number, y: number, cycle = false): number {
    if (!scene || !model || !chrome) return -1;
    const { o, d } = scene.ray(x, y, chrome.stage.clientWidth, chrome.stage.clientHeight);
    const hits: number[] = [];
    for (const part of pickParts(model.parts, o, d)) {
      const ei = model.entity[part];
      if (ei >= 0 && !hits.includes(ei)) hits.push(ei);
    }
    if (!cycle) return hits[0] ?? -1;
    const same = lastTap && Math.hypot(lastTap.x - x, lastTap.y - y) <= TAP_SLOP_PX && lastTap.hits.join() === hits.join();
    const at = same && lastTap ? (lastTap.at + 1) % Math.max(1, hits.length) : 0;
    lastTap = { x, y, hits, at };
    return hits[at] ?? -1;
  }

  function setCam(next: CameraState, animate: boolean): void {
    const to = { ...next, zoom: clampZoom(next.zoom) };
    if (animate && !reducedMotion) tween = { from: cam, to, t0: sched.now() };
    else {
      tween = null;
      cam = to;
    }
    loop.invalidate();
  }

  function zoomBy(f: number): void {
    setCam({ ...cam, zoom: cam.zoom * f }, false);
  }

  function rotateBy(step: 1 | -1): void {
    setCam({ ...cam, rotation: rotate(cam.rotation, step) }, false);
  }

  function panPx(dxPx: number, dyPx: number): void {
    if (!chrome) return;
    const mPerPx = (2 * baseHalf) / cam.zoom / Math.max(1, chrome.stage.clientHeight);
    const [gx, gz] = panGround(cam.rotation, -dxPx * mPerPx, dyPx * mPerPx);
    setCam({ ...cam, target: [cam.target[0] + gx, cam.target[1] + gz] }, false);
  }

  let inputCleanup: (() => void) | null = null;
  function bindInput(cv: HTMLCanvasElement): void {
    inputCleanup?.();
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; t: number; moved: boolean; timer: number | null } | null = null;
    let pinch: number | null = null;
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture?.(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      chrome?.hideMenu();
      if (pointers.size === 1) {
        down = { ...p, t: sched.now(), moved: false, timer: null };
        down.timer = sched.setTimeout(() => {
          if (!down || down.moved) return;
          const ei = pickAt(down.x, down.y);
          down = null;
          if (ei < 0) return;
          const pick = entityPick(ei);
          select(ei);
          const e2 = store.snapshot!.entities[ei];
          chrome?.showMenu(p.x, p.y, e2.name, [
            { label: 'Focus', run: () => focusEntity(ei) },
            { label: 'Show details', run: () => emitPick(pick) },
            { label: 'View as table', run: () => openTable() },
          ]);
        }, LONG_PRESS_MS);
      } else if (pointers.size === 2) {
        if (down?.timer) sched.clearTimeout(down.timer);
        down = null;
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 0) zoomBy(dist / pinch);
        pinch = dist;
        return;
      }
      if (down && !down.moved && Math.hypot(p.x - down.x, p.y - down.y) > TAP_SLOP_PX) {
        down.moved = true;
        if (down.timer) sched.clearTimeout(down.timer);
      }
      if (down?.moved) panPx(p.x - prev.x, p.y - prev.y);
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (down && !down.moved) {
        if (down.timer) sched.clearTimeout(down.timer);
        const ei = pickAt(down.x, down.y, true);
        select(ei);
        if (ei >= 0) emitPick(entityPick(ei));
      }
      down = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015));
    };
    const onKey = (e: KeyboardEvent) => {
      const step = 60;
      const map: Record<string, () => void> = {
        ArrowLeft: () => panPx(step, 0),
        ArrowRight: () => panPx(-step, 0),
        ArrowUp: () => panPx(0, step),
        ArrowDown: () => panPx(0, -step),
        '+': () => zoomBy(1.25),
        '=': () => zoomBy(1.25),
        '-': () => zoomBy(0.8),
        '_': () => zoomBy(0.8),
        '[': () => rotateBy(-1),
        ']': () => rotateBy(1),
      };
      const run = map[e.key];
      if (run) {
        e.preventDefault();
        run();
      }
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('keydown', onKey);
    inputCleanup = () => {
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('keydown', onKey);
      if (down?.timer) sched.clearTimeout(down.timer);
    };
  }

  function focusEntity(ei: number): void {
    if (!model) return;
    const a = entityAnchor(model, ei);
    if (!a) return;
    select(ei);
    setCam({ ...cam, target: [a[0], a[2]], zoom: Math.max(cam.zoom, 2) }, true);
  }

  function resize(): void {
    if (!chrome) return;
    chrome.layout();
    const w = chrome.stage.clientWidth, h = chrome.stage.clientHeight;
    if (scene && (tier === 'T1' || tier === 'T2')) {
      scene.setSize(w, h, currentDpr(tier));
      loop.invalidate();
    } else if (tier === 'T0') drawT0();
  }

  function openTable(): void {
    table?.update(store.snapshot, mine);
    table?.open();
  }

  function closeTable(): void {
    table?.close();
    (canvas ?? chrome?.tableButton)?.focus();
  }

  function samplePerf(): void {
    if (!visible()) return;
    const sample: UiPerfSample = {
      tickRenderMs: { p50: stats.renderP(50), p95: stats.renderP(95) },
      fps: stats.fps(),
      heapMb: heapMb(),
      renderTier: tier,
    };
    perfSamples.push(sample);
    window.dispatchEvent(new CustomEvent('ui.perf', { detail: sample }));
  }

  function setPerfTimer(on: boolean): void {
    if (on && perfTimer === null) perfTimer = window.setInterval(samplePerf, hooks.perfIntervalMs ?? PERF_INTERVAL_MS);
    if (!on && perfTimer !== null) {
      window.clearInterval(perfTimer);
      perfTimer = null;
    }
  }

  const onDocVisibility = () => loop.docVisibilityChanged();

  function diagnostics(): CityDiagnostics {
    const info = scene ? scene.info() : lastSceneInfo;
    if (scene) lastSceneInfo = info;
    const live = scene !== null;
    return {
      tier,
      tierReason: reason,
      fpsFirst2s,
      frameMsP95: stats.frameMsP95(),
      drawCalls: live ? info.drawCalls : 0,
      triangles: live ? info.triangles : 0,
      buildingParts: live ? scene!.partCount : 0,
      canvasPixels: canvas ? canvas.width * canvas.height : 0,
      geometries: info.geometries,
      textures: info.textures,
      gpuMemEstimateMb: live ? info.gpuBytes / (1024 * 1024) : 0,
      renders: loop.renders,
      framesWhileHidden: loop.framesWhileHidden,
      loadMs: { ...loadMs },
      stateVersion: store.stateVersion,
      subscribed: unsubscribe !== null,
    };
  }

  // ---------- public object ----------
  const api: CityRenderer = {
    async mount(container) {
      if (disposed || mounted) return;
      mounted = true;
      chrome = createChrome({
        container,
        onOverlay: (o) => api.setOverlay(o),
        onRotate: rotateBy,
        onZoom: zoomBy,
        onTable: openTable,
      });
      ramps = buildRamps(readTokens(chrome.root));
      table = createTableView({
        host: chrome.tableHost,
        anchor: (id) => anchorScreen(id) ?? { x: 0, y: 0 },
        onPick: (p) => {
          const ei = model?.entityIndex.get(p.entityId);
          if (ei !== undefined) select(ei);
          emitPick(p);
        },
        onClose: closeTable,
      });
      chrome.setOverlay(overlay);
      chrome.layout();
      resizeObs = new ResizeObserver(() => resize());
      resizeObs.observe(chrome.root);
      document.addEventListener('visibilitychange', onDocVisibility);
      if (loop.state === 'visible') {
        setSubscribed(true);
        setPerfTimer(true);
      }
      const first = await decideTier();
      await enterTier(first.tier, first.reason);
      if (store.snapshot) {
        table.update(store.snapshot, mine);
        if (model) recolor(true);
        else void ensureChunks();
      } else {
        const stamp = opts.channel.stateVersion(opts.cityId);
        if (stamp !== null) void fetchSnapshot(stamp);
      }
      if (hooks.expose ?? DEV_OR_E2E) exposeTestApi();
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      inputCleanup?.();
      inputCleanup = null;
      teardown3D();
      img = null;
      resizeObs?.disconnect();
      resizeObs = null;
      document.removeEventListener('visibilitychange', onDocVisibility);
      setPerfTimer(false);
      setSubscribed(false);
      table?.dispose();
      table = null;
      chrome?.dispose();
      chrome = null;
      labelEls = [];
      partsDrawn = false;
    },
    setData,
    setTier(t) {
      override = t;
      if (!mounted) return;
      void (async () => {
        const d = t === 'auto' ? await decideTier() : await Promise.resolve(initialTier({ override: t, hasWebGL2: true, batterySaver: false }));
        if (t === 'auto' && d.tier === 'T2' && tier === 'T1' && reason === 'auto-fps') return; // never step up
        await enterTier(d.tier, d.reason);
        if (t === 'auto' && tier === 'T2') {
          fpsFirst2s = null;
          if (partsDrawn) startMeasurement();
        }
      })();
    },
    getTier: () => ({ tier, reason }),
    setVisibility(v: Visibility) {
      loop.setVisibility(v);
      setPerfTimer(v === 'visible' && mounted);
    },
    setReducedMotion(on) {
      reducedMotion = on;
      if (on && tween) {
        cam = tween.to;
        tween = null;
      }
      loop.invalidate();
    },
    setOverlay(o) {
      overlay = o;
      chrome?.setOverlay(o);
      recolor(false);
    },
    setTimeOfDay(m) {
      gameMinute = m;
      applyLight();
      loop.invalidate();
    },
    focus(target) {
      if (!model) return;
      const ei = 'entityId' in target ? model.entityIndex.get(target.entityId) : model.parcelIndex.get(target.parcelId);
      if (ei !== undefined) focusEntity(ei);
    },
    onPick(cb) {
      pickCbs.add(cb);
      return () => pickCbs.delete(cb);
    },
    onTierChange(cb) {
      tierCbs.add(cb);
      return () => tierCbs.delete(cb);
    },
    openTable,
    closeTable,
    diagnostics,
    dispose() {
      if (disposed) return;
      api.unmount();
      disposed = true;
      loop.dispose();
      decoder.dispose();
      decoded.clear();
      pickCbs.clear();
      tierCbs.clear();
      model = null;
      ground = null;
    },
  };

  function exposeTestApi(): void {
    const t: CityTestApi = {
      diagnostics,
      rafPending: () => loop.pending,
      uploads: () => scene?.uploads ?? 0,
      snapshotFetches: () => snapshotFetches,
      chunkFetches: () => chunkFetches,
      pickableIds: () => {
        const s = store.snapshot;
        if (!s || !model) return [];
        return [...new Set([...s.districts.map((d) => d.id), ...[...model.partsOf.keys()].map((i) => s.entities[i].id)])];
      },
      tableRows: () => (table?.rows() ?? []).map((r) => ({ kind: r.kind, entityId: r.entityId, parcelId: r.parcelId, name: r.name, mine: r.mine })),
      anchorOf: anchorScreen,
      camera: () => cam,
      setCamera: (c) => setCam({ ...cam, ...c }, false),
      brassCheck: (dE) => brassCheck(dE),
      benchmark: (ms) =>
        new Promise((resolve) => {
          benchmarkOut = { intervals: [], cpu: [] };
          benchmarkLast = 0;
          benchmarkUntil = sched.now() + ms;
          loop.wake();
          sched.setTimeout(() => {
            const out = benchmarkOut!;
            benchmarkOut = null;
            benchmarkUntil = 0;
            resolve(out);
          }, ms + 50);
        }),
      perfSamples: () => [...perfSamples],
      decodeMs: () => decoder.decodeMs,
      decodeInWorker: () => decoder.inWorker,
    };
    (window as unknown as { __city: CityTestApi }).__city = t;
  }

  function brassCheck(dE: number): { brass: number; outside: number; maskPixels: number } | null {
    if (!scene || !canvas || !ramps || !chrome) return null;
    const gl = scene.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    scene.setCamera(cam, chrome.stage.clientWidth, chrome.stage.clientHeight, baseHalf);
    scene.render();
    const color = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, color);
    scene.render(true);
    const mask = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    scene.render();
    const acc = ramps.brass;
    let brass = 0, outside = 0, maskPixels = 0;
    for (let i = 0; i < w * h; i++) {
      const m = mask[i * 4] > 127;
      if (m) maskPixels++;
      const r = color[i * 4] / 255, g = color[i * 4 + 1] / 255, b = color[i * 4 + 2] / 255;
      // cheap prefilter before ΔE
      if (Math.abs(r - acc[0]) > 0.12 || Math.abs(g - acc[1]) > 0.12 || Math.abs(b - acc[2]) > 0.12) continue;
      if (deltaE76([r, g, b], acc) < dE) {
        brass++;
        if (!m) outside++;
      }
    }
    return { brass, outside, maskPixels };
  }

  return api;
}

function round(p: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}


import type * as THREE_NS from 'three';
import type {
  CityDiagnostics,
  CityOverlay,
  CityRenderer,
  CityRendererOptions,
  CityTier,
  PerfSample,
  PickResult,
  TierReason,
  Visibility,
} from '../index';
import type { CityDelta, CityManifest, CitySnapshot } from '../data/types';
import { CityStore } from '../data/store';
import { manifestUrl } from '../data/urls';
import { districtName } from '../data/names';
import { buildRamps, type Ramps } from '../art/ramps';
import { deltaE as deltaE76 } from '../art/color';
import { readTokens, cssVar, fontVar, sizeVar } from '../art/tokens';
import { createDecodeClient, type DecodeClient } from '../worker/client';
import type { DecodedChunk } from '../worker/decode';
import { FLOATS_PER_PART } from '../worker/format';
import { createTableView, type TableView } from '../table/table';
import { displayName } from '../table/rows';
import { createChrome, type Chrome } from '../chrome/chrome';
import { FrameStats, heapMb } from '../diagnostics/perf';
import { autoStep, initialTier, isBatterySaver, measureFps, readBattery, MEASURE_MS } from '../tiers/select';
import { clampZoom, panGround, rotate, viewDirection, type CameraState } from './camera';
import { RenderLoop, browserScheduler, type Scheduler } from './loop';
import { CityScene, type GroundData, type SceneConfig } from './scene';
import { buildModel, entityAnchor, groundBounds, polygonCentroid, type CityModel } from './model';
import { FLAT_BRASS, partColors } from './overlay';
import { pickParts } from './pick';
import { lightAt, occupancy, DEFAULT_GAME_MINUTE } from './light';
import { inPolygon, placeLabels as layoutLabels, type LabelBox, type Obstacle } from './labels';
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
  perfSamples: () => PerfSample[];
  manifestFetches: () => number;
  /** Placed district labels in CSS px (after collision-aware layout). */
  labelBoxes: () => (LabelBox & { text: string })[];
  /** Ambient life state: running, and ms left in the 60 s window. */
  ambient: () => { on: boolean; msLeft: number };
  /** Parts currently cut away in front of the selection. */
  cutCount: () => number;
  partsOfEntity: (entityId: string) => number;
  /** Relative luminance (p50, p75) of the map under each label box, labels not drawn (WCAG). */
  labelBackground: () => { text: string; p50: number; p75: number }[] | null;
  decodeMs: () => number;
  decodeInWorker: () => boolean;
}

const TIER_CONFIG: Record<'T1' | 'T2', { dprCap: number; maxPixels: number; nearRing: number; boats: boolean }> = {
  T2: { dprCap: 1.5, maxPixels: 2_400_000, nearRing: Infinity, boats: true },
  T1: { dprCap: 1.0, maxPixels: 2_000_000, nearRing: 220, boats: false },
};

const LONG_PRESS_MS = 500;
const TAP_SLOP_PX = 6;
/** Repeat taps within 8 px and 1.5 s cycle to the next building behind (review A.6). */
const CYCLE_SLOP_PX = 8;
const CYCLE_MS = 1500;
/** T2 ambient life: ≤ 12 fps, for at most 60 s after the last input (review A.5). */
const AMBIENT_FPS = 12;
const AMBIENT_WINDOW_MS = 60_000;
const CUT_FADE_MS = 180;
/** Map labels: Instrument Serif 16/20 via the display font token (review B1/B2). */
const LABEL_FONT = `400 ${sizeVar('mapLabel')}/20px ${fontVar('display')}`;
/** "City update pending" once the published state is older than the last day close (SR Q11). */
const PENDING_LAG_TICKS = 720;
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
  const perfSamples: PerfSample[] = [];
  let mine = new Set(opts.myEntityIds);

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
  let groundHash: string | null = null;
  let model: CityModel | null = null;
  let colors: { colors: Float32Array; flat: Uint8Array } | null = null;

  let unsubscribe: (() => void) | null = null;
  let pendingFetch = false;
  let snapshotFetches = 0;
  let manifestFetches = 0;
  let manifest: CityManifest | null = null;
  let manifestInflight: Promise<void> | null = null;
  let urlRetryFor: number | null = null;
  let lastInputAt = 0;
  let lastAmbientFrame = 0;
  let ambientOn = false;
  let selectedEi = -1;
  let cut: Uint8Array | null = null;
  let cutCount = 0;
  let cutT0 = 0;
  let cutCam = '';
  let chunkFetches = 0;
  let perfTimer: number | null = null;

  let cam: CameraState = { target: [0, 0], rotation: 0, zoom: 1 };
  let tween: { from: CameraState; to: CameraState; t0: number } | null = null;
  let baseHalf = 400;
  let cityExtent = 0;
  /** Default view half-height: the whole city fits the width on narrow (phone) viewports too. */
  const viewHalf = (): number => {
    const w = chrome?.stage.clientWidth || 1, h = chrome?.stage.clientHeight || 1;
    return Math.max(baseHalf, (cityExtent * 0.8 * h) / w);
  };
  let camSet = false;

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
      scene.setCamera(cam, w, h, viewHalf());
      scene.setTime(now / 1000);
      updateCut(now);
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
      if (ambientOn) lastAmbientFrame = now;
      if (model && model.parts.length && !partsDrawn) {
        partsDrawn = true;
        loadMs.firstFrame = performance.now() - t0;
        startMeasurement();
        noteInput(); // the city appearing opens the first ambient window
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
      if (cut && selectedEi >= 0 && now - cutT0 < CUT_FADE_MS) moving = true; // cut-away fade
      setAmbient(ambientWanted(now));
      if (moving) return true;
      if (!ambientOn) return false;
      const wait = 1000 / AMBIENT_FPS - (now - lastAmbientFrame);
      if (now + Math.max(0, wait) >= lastInputAt + AMBIENT_WINDOW_MS) {
        setAmbient(false); // the next ambient frame would fall past the window: stop now
        return false;
      }
      return wait <= 0 ? true : wait;
    },
    onBackgroundLong() {
      setSubscribed(false);
    },
    onVisible() {
      if (!mounted) return;
      setSubscribed(true);
      const stamp = opts.channel.stateVersion(opts.cityId);
      if (stamp !== null && stamp !== store.stateVersion) void syncManifest();
      else if (pendingFetch) void ensureChunks();
    },
    onIdle() {
      stats.pause();
    },
  });

  // ---------- ambient life ----------
  function ambientWanted(now: number): boolean {
    return tier === 'T2' && !reducedMotion && scene !== null && partsDrawn && now - lastInputAt < AMBIENT_WINDOW_MS;
  }

  function setAmbient(on: boolean): void {
    if (on === ambientOn) return;
    ambientOn = on;
    scene?.setAmbient(on);
    if (!on) loop.invalidate(); // one last still frame without boats, then the loop stops
  }

  /** Any input (or the city appearing) opens a new 60 s ambient window. */
  function noteInput(): void {
    lastInputAt = sched.now();
    if (ambientWanted(lastInputAt)) {
      setAmbient(true);
      loop.wake();
    }
  }

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

  async function fetchJson<T>(url: string): Promise<T> {
    const buf = await opts.fetchChunk(url);
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  }

  /**
   * The manifest is the entry point (SR Q1): it names the snapshot, the deltas from the last two
   * versions, and every chunk and the ground by content hash. A listed delta from our version is
   * applied; anything else loads the snapshot.
   */
  function syncManifest(): Promise<void> {
    if (!visible()) {
      pendingFetch = true;
      return Promise.resolve();
    }
    if (manifestInflight) return manifestInflight;
    manifestInflight = (async () => {
      try {
        manifestFetches++;
        const m = await fetchJson<CityManifest>(manifestUrl(opts.cityId));
        if (disposed || m.cityId !== opts.cityId) return;
        manifest = m;
        const have = store.stateVersion;
        if (have === m.snapshot.stateVersion) {
          if (pendingFetch) void ensureChunks();
          updatePending();
          return;
        }
        const delta = have === null ? undefined : m.deltas.find((d) => d.base === have);
        if (delta) {
          const d = await fetchJson<CityDelta>(delta.url);
          if (!disposed) {
            const r = store.apply(d);
            if (r.status === 'applied') {
              afterApply(r.changedChunks.length === 0 && !r.full);
              return;
            }
          }
        }
        snapshotFetches++;
        const snap = await fetchJson<CitySnapshot>(m.snapshot.url);
        if (!disposed) setData(snap);
      } catch (err) {
        console.warn('[city] manifest sync failed', err);
      } finally {
        manifestInflight = null;
      }
    })();
    return manifestInflight;
  }

  function setData(input: CitySnapshot | CityDelta): void {
    if (disposed || input.cityId !== opts.cityId) return;
    const r = store.apply(input);
    if (r.status === 'needs-snapshot') {
      void syncManifest();
      return;
    }
    if (r.status !== 'applied') return;
    afterApply(r.changedChunks.length === 0 && !r.full);
  }

  function afterApply(entitiesOnly: boolean): void {
    const s = store.snapshot!;
    updatePending();
    table?.update(s, mine);
    if (entitiesOnly && model) {
      rebuildModel(); // entity changes only
      return;
    }
    void ensureChunks();
  }

  /** lag = clock tick − publicSnapshotTick. The clock tick is not on the seam yet [open: Front Dev]. */
  function updatePending(): void {
    const s = store.snapshot;
    const clock = (opts.channel as { clockTick?: () => number | null }).clockTick?.() ?? null;
    const lag = s && clock !== null ? clock - s.publicSnapshotTick : 0;
    chrome?.setPending(lag > PENDING_LAG_TICKS ? 'City update pending' : null);
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
    // every URL comes from the manifest, by content hash (SR Q1)
    const urlOf = new Map<string, string>((manifest?.chunks ?? []).map((c) => [c.contentHash, c.url]));
    if (manifest) urlOf.set(manifest.ground.contentHash, manifest.ground.url);
    const missing = [s.ground.contentHash, ...s.chunks.map((c) => c.contentHash)].some((h) => !urlOf.has(h) && !decoded.has(h) && h !== groundHash);
    if (missing) {
      if (urlRetryFor !== version) {
        urlRetryFor = version;
        manifest = null;
        void syncManifest().then(() => ensureChunks());
      }
      return;
    }
    const jobs: Promise<unknown>[] = [];
    if (groundHash !== s.ground.contentHash) {
      const g = s.ground;
      jobs.push(
        opts.fetchChunk(urlOf.get(g.contentHash)!).then((buf) => {
          chunkFetches++;
          const b = groundBounds(g);
          ground = { mask: new Uint8Array(buf), size: g.size, x0: b.x0, z0: b.z0, span: b.size };
          groundHash = g.contentHash;
        }),
      );
    }
    for (const ref of s.chunks) {
      if (decoded.has(ref.contentHash)) continue;
      jobs.push(
        opts.fetchChunk(urlOf.get(ref.contentHash)!).then(async (buf) => {
          chunkFetches++;
          decoded.set(ref.contentHash, await decoder.decode(buf));
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
    const live = new Set(s.chunks.map((c) => c.contentHash));
    for (const h of decoded.keys()) if (!live.has(h)) decoded.delete(h);
    if (!loadMs.firstChunk) loadMs.firstChunk = performance.now() - t0;
    rebuildModel(true);
  }

  function rebuildModel(geometryChanged = false): void {
    const s = store.snapshot;
    if (!s || !ramps) return;
    if (geometryChanged || !model) {
      model = buildModel(s, decoded);
      const b = groundBounds(s.ground);
      baseHalf = b.extent * 0.75;
      cityExtent = b.extent;
      if (!camSet) {
        cam = { ...cam, target: [b.cx, b.cz] };
        camSet = true;
      }
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
    const { size, mask, x0, z0, span } = ground;
    const i = Math.floor(((x - x0) / span) * size);
    const j = Math.floor(((z - z0) / span) * size);
    if (i < 0 || j < 0 || i >= size || j >= size) return false;
    return mask[j * size + i] === 0;
  }

  function applyLight(): void {
    if (!scene || !ramps) return;
    // default lighting = time of day × occupancy only (SR headline 1)
    scene.setLight(lightAt(gameMinute, occupancy(store.snapshot?.districts ?? [])));
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

  function labelSpecs(): { id: string; text: string; anchor: [number, number]; ground: [number, number][] }[] {
    const s = store.snapshot;
    if (!s) return [];
    return s.districts.map((d) => {
      const anchor = polygonCentroid(d.polygon);
      // candidate ground points: rings around the centroid, inside the district, on land
      const ground: [number, number][] = [anchor];
      for (const r of [30, 60, 90, 130, 170]) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const x = anchor[0] + Math.cos(a) * r, z = anchor[1] + Math.sin(a) * r;
          if (inPolygon(x * 100, z * 100, d.polygon) && !isWater(x, z)) ground.push([x, z]);
        }
      }
      return { id: d.id, text: districtName(d.nameKey), anchor, ground };
    });
  }

  function drawT0(): void {
    if (!chrome || !ramps || tier !== 'T0') return;
    const s = store.snapshot;
    if (!img) {
      img = document.createElement('img');
      Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain' });
      chrome.stage.append(img);
    }
    img.alt = s ? 'Picture of the city. Use View as table to browse it.' : 'City picture loading';
    if (!s || !model || !colors) return;
    // canvas needs the resolved font, not var(): read it back from a probe
    const probe = document.createElement('span');
    probe.style.font = LABEL_FONT;
    chrome.labels.append(probe);
    const cs = getComputedStyle(probe);
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    probe.remove();
    img.src = drawPicture({
      width: chrome.stage.clientWidth,
      height: chrome.stage.clientHeight,
      dpr: Math.min(2, window.devicePixelRatio || 1),
      ground,
      parts: model.parts,
      colors: colors.colors,
      flat: colors.flat,
      ramps,
      labels: labelSpecs().map((l) => ({ text: l.text, x: l.anchor[0], z: l.anchor[1] })),
      labelFont: font,
    });
  }

  // ---------- labels, picking, input ----------
  // District labels: Instrument Serif 16/20 in --fg with a 3 px --bg0 knockout stroke (a text
  // outline, not a shadow), placed away from tall parts (review B1).
  let labelEls: { el: HTMLButtonElement; text: string; ground: [number, number][]; w: number; h: number }[] = [];
  let labelKey = '';
  let labelBoxes: LabelBox[] = [];
  function buildLabels(): void {
    if (!chrome) return;
    chrome.labels.replaceChildren();
    labelEls = [];
    labelKey = '';
    for (const spec of labelSpecs()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'city-district-label';
      b.textContent = spec.text;
      Object.assign(b.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        pointerEvents: 'auto',
        background: 'none',
        border: '0',
        padding: '0 4px',
        color: cssVar('fg'),
        font: LABEL_FONT,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        webkitTextStroke: `6px ${cssVar('bg0')}`, // centred stroke: 3 px outside the glyph
        paintOrder: 'stroke fill',
      } as Partial<CSSStyleDeclaration>);
      const id = spec.id;
      b.addEventListener('click', () => emitPick(districtPick(id)));
      chrome.labels.append(b);
      labelEls.push({ el: b, text: spec.text, ground: spec.ground, w: 0, h: 0 });
    }
  }

  function placeLabels(): void {
    if (!scene || !chrome || !model) return;
    const w = chrome.stage.clientWidth, h = chrome.stage.clientHeight;
    const key = `${w}x${h}|${cam.target.join()}|${cam.zoom}|${cam.rotation}|${labelEls.length}|${model.parts.length}`;
    if (key === labelKey) return;
    labelKey = key;
    for (const l of labelEls) {
      l.w = l.el.offsetWidth;
      l.h = l.el.offsetHeight;
    }
    const obstacles = partObstacles(w, h);
    labelBoxes = layoutLabels(
      labelEls.map((l) => ({ w: l.w, h: l.h, candidates: l.ground.map(([x, z]) => scene!.project([x, 0, z], w, h)) })),
      obstacles,
      { w, h },
    );
    labelEls.forEach((l, i) => {
      const b = labelBoxes[i];
      l.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px)`;
    });
  }

  /** Screen boxes of every part; tall and brass parts weigh more (their windows/brass are bright). */
  function partObstacles(w: number, h: number): Obstacle[] {
    if (!scene || !model) return [];
    const out: Obstacle[] = [];
    const p = model.parts;
    for (let i = 0; i < p.length / FLOATS_PER_PART; i++) {
      const o = i * FLOATS_PER_PART;
      const [x, z, pw, pd, y0, ph] = [p[o], p[o + 1], p[o + 2], p[o + 3], p[o + 4], p[o + 5]];
      let x0 = Infinity, x1 = -Infinity, y0s = Infinity, y1s = -Infinity;
      for (const c of [[x - pw / 2, y0, z - pd / 2], [x + pw / 2, y0, z + pd / 2], [x - pw / 2, y0, z + pd / 2], [x + pw / 2, y0, z - pd / 2], [x - pw / 2, y0 + ph, z - pd / 2], [x + pw / 2, y0 + ph, z + pd / 2], [x - pw / 2, y0 + ph, z + pd / 2], [x + pw / 2, y0 + ph, z - pd / 2]] as [number, number, number][]) {
        const s = scene.project(c, w, h);
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0s = Math.min(y0s, s.y); y1s = Math.max(y1s, s.y);
      }
      if (x1 < 0 || y1s < 0 || x0 > w || y0s > h) continue;
      const brass = colors?.flat[i] === FLAT_BRASS;
      out.push({ x: x0, y: y0s, w: x1 - x0, h: y1s - y0s, weight: brass ? 6 : y0 + ph > 40 ? 3 : 1 });
    }
    return out;
  }

  function districtPick(id: string): PickResult {
    const i = store.snapshot?.districts.findIndex((x) => x.id === id) ?? -1;
    const b = labelBoxes[i];
    const screen = b && scene ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
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
    selectedEi = ei;
    cutCam = '';
    cutT0 = sched.now();
    loop.invalidate();
  }

  /**
   * Cut-away (review A.6): parts in front of the selection, within its screen outline + 4 px, are
   * not drawn, so the selected building is always visible. Fades over 180 ms; instant under
   * reduced motion. Recomputed when the camera or selection changes.
   */
  function updateCut(now: number): void {
    if (!scene || !model || !chrome) return;
    if (selectedEi < 0 || !model.partsOf.has(selectedEi)) {
      if (cut) {
        cut = null;
        cutCount = 0;
        scene.setCut(new Uint8Array(model.parts.length / FLOATS_PER_PART), 0);
      }
      return;
    }
    const w = chrome.stage.clientWidth, h = chrome.stage.clientHeight;
    const key = `${w}x${h}|${cam.target.join()}|${cam.zoom}|${cam.rotation}|${selectedEi}|${model.parts.length}`;
    if (key !== cutCam) {
      cutCam = key;
      const [vx, , vz] = viewDirection(cam.rotation);
      const p = model.parts;
      const rect = (i: number) => {
        const o = i * FLOATS_PER_PART;
        const [x, z, pw, pd, y0, ph] = [p[o], p[o + 1], p[o + 2], p[o + 3], p[o + 4], p[o + 5]];
        let x0 = Infinity, x1 = -Infinity, ya = Infinity, yb = -Infinity;
        for (const c of [[x - pw / 2, y0, z - pd / 2], [x + pw / 2, y0, z + pd / 2], [x - pw / 2, y0, z + pd / 2], [x + pw / 2, y0, z - pd / 2], [x - pw / 2, y0 + ph, z - pd / 2], [x + pw / 2, y0 + ph, z + pd / 2], [x - pw / 2, y0 + ph, z + pd / 2], [x + pw / 2, y0 + ph, z - pd / 2]] as [number, number, number][]) {
          const s = scene!.project(c, w, h);
          x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); ya = Math.min(ya, s.y); yb = Math.max(yb, s.y);
        }
        return { x0, x1, y0: ya, y1: yb, depth: x * vx + z * vz };
      };
      const own = model.partsOf.get(selectedEi)!;
      const sel = own.map(rect);
      const box = { x0: Math.min(...sel.map((r) => r.x0)) - 4, x1: Math.max(...sel.map((r) => r.x1)) + 4, y0: Math.min(...sel.map((r) => r.y0)) - 4, y1: Math.max(...sel.map((r) => r.y1)) + 4 };
      const depth = Math.max(...sel.map((r) => r.depth));
      const n = p.length / FLOATS_PER_PART;
      const flags = new Uint8Array(n);
      const ownSet = new Set(own);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (ownSet.has(i)) continue;
        const r = rect(i);
        if (r.depth <= depth) continue; // behind (further from the camera)
        if (r.x1 < box.x0 || r.x0 > box.x1 || r.y1 < box.y0 || r.y0 > box.y1) continue;
        flags[i] = 1;
        count++;
      }
      cut = flags;
      cutCount = count;
      scene.setCut(flags, reducedMotion ? 1 : Math.min(1, (now - cutT0) / CUT_FADE_MS));
      return;
    }
    scene.setCut(null, reducedMotion ? 1 : Math.min(1, (now - cutT0) / CUT_FADE_MS));
  }

  // Tapping the same spot again picks the next entity behind (buildings hidden by taller ones
  // stay reachable on the map, CTY-05 / C-02).
  let lastTap: { x: number; y: number; hits: number[]; at: number; t: number } | null = null;
  function pickAt(x: number, y: number, cycle = false): number {
    if (!scene || !model || !chrome) return -1;
    const { o, d } = scene.ray(x, y, chrome.stage.clientWidth, chrome.stage.clientHeight);
    const hits: number[] = [];
    for (const part of pickParts(model.parts, o, d)) {
      const ei = model.entity[part];
      if (ei >= 0 && !hits.includes(ei)) hits.push(ei);
    }
    if (!cycle) return hits[0] ?? -1;
    const t = sched.now();
    const same = lastTap && Math.hypot(lastTap.x - x, lastTap.y - y) <= CYCLE_SLOP_PX && t - lastTap.t <= CYCLE_MS && lastTap.hits.join() === hits.join();
    const at = same && lastTap ? (lastTap.at + 1) % Math.max(1, hits.length) : 0;
    lastTap = { x, y, hits, at, t };
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
    const mPerPx = (2 * viewHalf()) / cam.zoom / Math.max(1, chrome.stage.clientHeight);
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
      noteInput();
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
          chrome?.showMenu(p.x, p.y, displayName(e2.name, e2.parcelId), [
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
      noteInput();
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
        noteInput();
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
    noteInput();
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

  let exposeEvents = false;
  /**
   * ui.perf (17 §5.2) goes to the shell's injected sink, once a minute while visible. A value the
   * browser cannot measure is NaN (never a made-up 0). The window event exists only behind the
   * dev/e2e window.__city hook.
   */
  function samplePerf(): void {
    if (!visible()) return;
    const sample: PerfSample = {
      tickRenderMsP50: stats.renderP(50) ?? Number.NaN,
      tickRenderMsP95: stats.renderP(95) ?? Number.NaN,
      fps: stats.fps() ?? Number.NaN,
      heapMb: heapMb() ?? Number.NaN,
      renderTier: tier,
    };
    perfSamples.push(sample);
    opts.onPerfSample?.(sample);
    if (exposeEvents) window.dispatchEvent(new CustomEvent('ui.perf', { detail: sample }));
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
        if (stamp !== null) void syncManifest();
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
    setMyPlaces(ids) {
      mine = new Set(ids); // client-only: never sent anywhere (17-AT-21)
      table?.update(store.snapshot, mine);
      recolor(false);
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
    exposeEvents = true;
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
      setCamera: (c) => {
        noteInput();
        setCam({ ...cam, ...c }, false);
      },
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
      manifestFetches: () => manifestFetches,
      labelBoxes: () => labelBoxes.map((b, i) => ({ ...b, text: labelEls[i]?.text ?? '' })),
      ambient: () => ({ on: ambientOn, msLeft: Math.max(0, AMBIENT_WINDOW_MS - (sched.now() - lastInputAt)) }),
      cutCount: () => cutCount,
      labelBackground: () => labelBackground(),
      partsOfEntity: (id) => {
        const ei = model?.entityIndex.get(id);
        return ei === undefined ? 0 : (model!.partsOf.get(ei)?.length ?? 0);
      },
      decodeMs: () => decoder.decodeMs,
      decodeInWorker: () => decoder.inWorker,
    };
    (window as unknown as { __city: CityTestApi }).__city = t;
  }

  function labelBackground(): { text: string; p50: number; p75: number }[] | null {
    if (!scene || !canvas || !chrome) return null;
    const gl = scene.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    scene.setCamera(cam, chrome.stage.clientWidth, chrome.stage.clientHeight, viewHalf());
    scene.render();
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const k = W / chrome.stage.clientWidth;
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return labelBoxes.map((b, i) => {
      const lum: number[] = [];
      for (let y = Math.max(0, Math.floor(b.y * k)); y < Math.min(H, Math.ceil((b.y + b.h) * k)); y++) {
        for (let x = Math.max(0, Math.floor(b.x * k)); x < Math.min(W, Math.ceil((b.x + b.w) * k)); x++) {
          const o = ((H - 1 - y) * W + x) * 4;
          lum.push(0.2126 * lin(px[o] / 255) + 0.7152 * lin(px[o + 1] / 255) + 0.0722 * lin(px[o + 2] / 255));
        }
      }
      lum.sort((a, c) => a - c);
      const q = (p: number) => lum[Math.min(lum.length - 1, Math.floor(p * lum.length))] ?? 0;
      return { text: labelEls[i]?.text ?? '', p50: q(0.5), p75: q(0.75) };
    });
  }

  function brassCheck(dE: number): { brass: number; outside: number; maskPixels: number } | null {
    if (!scene || !canvas || !ramps || !chrome) return null;
    const gl = scene.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    scene.setCamera(cam, chrome.stage.clientWidth, chrome.stage.clientHeight, viewHalf());
    scene.render();
    const color = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, color);
    scene.render(true);
    const mask = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    scene.render();
    const tones = [ramps.brass, ramps.brassHi, ramps.brassLo]; // --acc, --acc-hi, --acc-lo
    let brass = 0, outside = 0, maskPixels = 0;
    for (let i = 0; i < w * h; i++) {
      const m = mask[i * 4] > 127;
      if (m) maskPixels++;
      const r = color[i * 4] / 255, g = color[i * 4 + 1] / 255, b = color[i * 4 + 2] / 255;
      for (const acc of tones) {
        // cheap prefilter before ΔE
        if (Math.abs(r - acc[0]) > 0.12 || Math.abs(g - acc[1]) > 0.12 || Math.abs(b - acc[2]) > 0.12) continue;
        if (deltaE76([r, g, b], acc) < dE) {
          brass++;
          if (!m) outside++;
          break;
        }
      }
    }
    return { brass, outside, maskPixels };
  }

  return api;
}

function round(p: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}


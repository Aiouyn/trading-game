'use client';

// Test hooks on window.__tg (tape-e2e-conventions.md section 3, P2-250..P2-258). `state`, `advance` and
// `pause` are always present once the shell mounts. `window.__tg.e2e` exists only under ?e2e: without the flag
// it is undefined, and nothing feature-detects around that (P2-250). The world server owns the clock and the
// prices, so the writes go through the server's admin routes with the admin token the test puts on the page
// (window.__tgE2eAdmin, set by tests/e2e/helpers.ts through addInitScript). Without that token they do nothing.
import { useGame } from '@/game/store';
import { worldHttpUrl } from '@/net/client';
import { backdateIdle } from './idle';

export interface E2eHooks {
  /** Grants cash to the player through the server's admin route. Returns true when the server took it. */
  grantCash: (n: number) => Promise<boolean>;
  /** Moves the player's cash to n through the admin grant (the difference is granted or taken). */
  setCash: (n: number) => Promise<boolean>;
  /** Prices move on the world server, so the shock hook has no client path in V1 (open item). It throws. */
  shock: (id: string, pct: number) => never;
  /** Sets the rank-up idle clock to ten seconds ago. Changes no rule (a pending order still blocks). */
  idle: () => void;
  /** A deep copy of the player's orders, read only. */
  orders: () => unknown[];
  /** The live charts, from the chart hosts on the page (data-chart-id on each). */
  charts: () => { id: string; testId: string }[];
  /** Frame times since the last call, then reset: count, p95 and max in ms. */
  frames: () => { n: number; p95: number; max: number };
}

export interface TgHooks {
  state: typeof useGame.getState;
  /** Advances the world by n ticks through the admin route. Resolves to the tick the server reports, or null. */
  advance: (n: number) => Promise<number | null>;
  /** The server runs the clock, so the client cannot pause it. Returns false. */
  pause: () => boolean;
  e2e?: E2eHooks;
}

declare global {
  interface Window {
    __tg?: TgHooks;
    /** Test-only: the admin token the e2e helpers put on the page. Never set by the app. */
    __tgE2eAdmin?: string;
  }
}

function adminToken(): string | null {
  return typeof window !== 'undefined' && typeof window.__tgE2eAdmin === 'string' ? window.__tgE2eAdmin : null;
}

async function adminPost(path: string, body: unknown): Promise<Response | null> {
  const token = adminToken();
  if (token === null) return null;
  try {
    return await fetch(`${worldHttpUrl()}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function grant(amount: number): Promise<boolean> {
  const handle = useGame.getState().me?.player.handle;
  if (!handle) return false;
  const r = await adminPost('/api/admin/grant', { handle, amount });
  return r !== null && r.ok;
}

const FRAME_CAP = 10_000;
const deltas: number[] = [];
let lastFrame = 0;

function sampleFrames(t: number): void {
  if (lastFrame !== 0 && deltas.length < FRAME_CAP) deltas.push(t - lastFrame);
  lastFrame = t;
  window.requestAnimationFrame(sampleFrames);
}

function frameStats(): { n: number; p95: number; max: number } {
  const sorted = deltas.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const p95 = n === 0 ? 0 : sorted[Math.min(n - 1, Math.floor(n * 0.95))]!;
  const max = n === 0 ? 0 : sorted[n - 1]!;
  deltas.length = 0;
  return { n, p95, max };
}

const e2eHooks: E2eHooks = {
  grantCash: grant,
  setCash: async (n) => {
    const cash = useGame.getState().me?.account?.cash ?? 0;
    return grant(n - cash);
  },
  shock: (id) => {
    throw new Error(`shock(${id}): prices move on the world server, which has no client hook in V1`);
  },
  idle: () => backdateIdle(10_000),
  orders: () => structuredClone(useGame.getState().me?.orders ?? []),
  charts: () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-chart-id]')).map((el) => ({
      id: el.dataset.chartId ?? '',
      testId: el.dataset.testid ?? '',
    })),
  frames: frameStats,
};

/**
 * Installs window.__tg once the shell mounts. The e2e set is added only under ?e2e, and only then does the
 * frame-time sampler run (P2-252). Returns a cleanup for React strict mode.
 */
export function installTestHooks(): () => void {
  const hooks: TgHooks = {
    state: useGame.getState,
    advance: async (n) => {
      const r = await adminPost(`/api/admin/advance?n=${Math.max(1, Math.floor(n))}`, {});
      if (r === null || !r.ok) return null;
      const j = (await r.json()) as { tick?: number };
      return typeof j.tick === 'number' ? j.tick : null;
    },
    pause: () => false,
  };
  const flag = new URLSearchParams(window.location.search).has('e2e');
  if (flag) {
    hooks.e2e = e2eHooks;
    lastFrame = 0;
    window.requestAnimationFrame(sampleFrames);
  }
  window.__tg = hooks;
  return () => {
    if (window.__tg === hooks) delete window.__tg;
  };
}

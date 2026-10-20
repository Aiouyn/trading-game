import type { Visibility } from '../index';

export interface Scheduler {
  raf(cb: (t: number) => void): number;
  cancelRaf(id: number): void;
  setTimeout(cb: () => void, ms: number): number;
  clearTimeout(id: number): void;
  now(): number;
  /** document.hidden */
  docHidden(): boolean;
}

export const BACKGROUND_UNSUBSCRIBE_MS = 30_000;

export interface LoopHooks {
  /** Draws one frame. `continuous` is true when the next frame is already wanted. */
  draw(now: number, continuous: boolean): void;
  /** Advances animations; returns true while something still moves. */
  animate(now: number): boolean;
  onBackgroundLong(): void;
  onVisible(): void;
  onIdle(): void;
}

/**
 * Render-on-demand loop (spec §6): a frame is drawn only when dirty or animating, and the rAF
 * chain stops as soon as nothing is. Hidden or background → no frames at all.
 */
export class RenderLoop {
  renders = 0;
  framesWhileHidden = 0;
  private dirty = false;
  private rafId: number | null = null;
  private continuousUntil = 0;
  private visibility: Visibility = 'visible';
  private bgTimer: number | null = null;
  private disposed = false;

  constructor(
    private readonly s: Scheduler,
    private readonly hooks: LoopHooks,
  ) {}

  get pending(): boolean {
    return this.rafId !== null;
  }

  get state(): Visibility {
    return this.visibility;
  }

  invalidate(): void {
    this.dirty = true;
    this.kick();
  }

  /** Forces continuous rendering until `until` (scheduler clock). Used for the 2 s tier window. */
  forceContinuous(until: number): void {
    this.continuousUntil = Math.max(this.continuousUntil, until);
    this.kick();
  }

  /** Ends a forced continuous window early. */
  endContinuous(): void {
    this.continuousUntil = 0;
  }

  /** Starts the loop if an animation wants frames. */
  wake(): void {
    this.kick();
  }

  setVisibility(v: Visibility): void {
    if (this.disposed || v === this.visibility) return;
    const prev = this.visibility;
    this.visibility = v;
    if (v === 'visible' && this.bgTimer !== null) {
      this.s.clearTimeout(this.bgTimer);
      this.bgTimer = null;
    }
    if (v !== 'visible') {
      this.stop();
      if (prev === 'visible') {
        this.bgTimer = this.s.setTimeout(() => {
          this.bgTimer = null;
          this.hooks.onBackgroundLong();
        }, BACKGROUND_UNSUBSCRIBE_MS);
      }
      return;
    }
    if (prev !== 'visible') {
      this.hooks.onVisible();
      this.invalidate();
    }
  }

  /** document visibilitychange */
  docVisibilityChanged(): void {
    if (this.s.docHidden()) this.stop();
    else this.kick();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    if (this.bgTimer !== null) this.s.clearTimeout(this.bgTimer);
    this.bgTimer = null;
  }

  private active(): boolean {
    return !this.disposed && this.visibility === 'visible' && !this.s.docHidden();
  }

  private kick(): void {
    if (this.rafId !== null || !this.active()) return;
    this.rafId = this.s.raf(() => this.tick());
  }

  private stop(): void {
    if (this.rafId !== null) this.s.cancelRaf(this.rafId);
    this.rafId = null;
  }

  private tick(): void {
    this.rafId = null;
    if (!this.active()) return;
    const now = this.s.now();
    const animating = this.hooks.animate(now);
    const forced = now < this.continuousUntil;
    if (this.dirty || animating || forced) {
      this.dirty = false;
      if (this.s.docHidden()) this.framesWhileHidden++;
      this.renders++;
      this.hooks.draw(now, animating || forced);
    }
    if (this.dirty || animating || now < this.continuousUntil) this.kick();
    else this.hooks.onIdle();
  }
}

export function browserScheduler(): Scheduler {
  return {
    raf: (cb) => requestAnimationFrame(cb),
    cancelRaf: (id) => cancelAnimationFrame(id),
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    now: () => performance.now(),
    docHidden: () => document.hidden,
  };
}

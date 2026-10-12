import { callCostUsd, type TextConfig } from './config';
import { TextCallError, callClaude } from './claude';
import { factsHash, promptFor, SYSTEM_PROMPT, type EnrichItem } from './facts';
import { validateReply, type RejectReason } from './validate';

/**
 * The model text enricher (lead-phase7.md P7-2). It runs outside the world's step: the world emits its template line at once,
 * and this may later attach a model line for the same item as a presentation-only overlay. Nothing here reads or writes the
 * game state, and nothing it makes ever enters a snapshot or the command log, so replays do not move.
 */

export interface OverlayLine { en: string; fr: string }

/** The storage the enricher needs: the cache and the daily spend (server/db.ts Store has these methods). */
export interface TextStore {
  textCacheGet(role: string, factsHash: string, locale: string): string | null;
  textCachePut(role: string, factsHash: string, locale: string, text: string): void;
  textSpendOn(day: string): number;
  textSpendAdd(day: string, usd: number): void;
}

export type SkipReason = 'cap' | 'rate';
export type FallbackReason = RejectReason | TextCallError['reason'];

export interface TextReadout {
  enabled: boolean;
  provider: 'claude' | null;
  model: string;
  roles: string[];
  day: string;
  dailyUsdCap: number;
  spentToday: number;
  /** the cost reserved for calls in flight today (counted against the cap until each one answers) */
  reservedToday: number;
  /** calls sent to the provider */
  calls: number;
  /** items answered from the cache (no call, no cost) */
  hits: number;
  /** items that kept the template, by reason: a validation reject, a timeout or an error */
  rejects: Record<FallbackReason, number>;
  /** items not sent: the daily cap was reached, or the role's rate limit */
  stops: Record<SkipReason, number>;
  /** the number of template fallbacks (the sum of rejects) */
  fallbacks: number;
  overlaySize: number;
}

const OVERLAY_KEEP = 300;
const RATE_WINDOW_MS = 60_000;

const EMPTY_REJECTS = (): Record<FallbackReason, number> => ({
  json: 0, locale: 0, language: 0, length: 0, number: 0, banned: 0, advice: 0, timeout: 0, http: 0, network: 0, shape: 0,
});

/** The UTC day a cap is counted on: the spend resets at the next real day. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface EnricherOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface OverlayEntry { line: OverlayLine; seq: number }
interface Flight { ids: string[]; done: Promise<void> }

export class TextEnricher {
  private overlayMap = new Map<string, OverlayEntry>();
  /** the overlay version: each line that lands takes the next number (a connection's cursor is the last number it was sent) */
  private seq = 0;
  private inflight = new Map<string, Flight>();
  /** the cost reserved per UTC day for calls in flight (released when each answers) */
  private reserved = new Map<string, number>();
  private rate = new Map<string, number[]>();
  private calls = 0;
  private hits = 0;
  private rejects = EMPTY_REJECTS();
  private stops: Record<SkipReason, number> = { cap: 0, rate: 0 };
  private now: () => number;

  constructor(private cfg: TextConfig, private store: TextStore, private opts: EnricherOptions = {}) {
    this.now = opts.now ?? Date.now;
  }

  get enabled(): boolean {
    return this.cfg.enabled;
  }

  /**
   * Offer one world item. A cached item is answered at once; otherwise a call is made unless the day's cap (spend plus the cost
   * reserved for calls in flight) or the role's rate limit stops it. An identical item that arrives while its twin is in flight
   * waits on that call and gets the same line. Never throws and never waits: the answer lands in the overlay when it validates.
   */
  offer(item: EnrichItem): void {
    if (!this.cfg.enabled || !this.cfg.roles.has(item.role) || this.overlayMap.has(item.id)) return;
    const hash = factsHash(item.facts);
    const key = `${item.role}|${hash}`;
    const open = this.inflight.get(key);
    if (open) {
      if (!open.ids.includes(item.id)) open.ids.push(item.id);
      return;
    }
    const en = this.store.textCacheGet(item.role, hash, 'en');
    const fr = this.store.textCacheGet(item.role, hash, 'fr');
    if (en !== null && fr !== null) {
      this.hits++;
      this.setOverlay(item.id, { en, fr });
      return;
    }
    const now = this.now();
    const day = dayOf(now);
    const reserve = this.reserveFor(item);
    const committed = this.store.textSpendOn(day) + (this.reserved.get(day) ?? 0);
    if (committed + reserve > this.cfg.dailyUsdCap) {
      this.stops.cap++;
      return;
    }
    const recent = (this.rate.get(item.role) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= this.cfg.ratePerMinute) {
      this.stops.rate++;
      this.rate.set(item.role, recent);
      return;
    }
    recent.push(now);
    this.rate.set(item.role, recent);
    this.calls++;
    this.reserved.set(day, (this.reserved.get(day) ?? 0) + reserve);
    const flight: Flight = { ids: [item.id], done: Promise.resolve() };
    this.inflight.set(key, flight);
    flight.done = this.run(item, hash, day, key, flight, reserve);
  }

  /**
   * The most a call can cost, estimated before it is sent: the prompt at two characters per token (an over-estimate, so the
   * reservation is never short) and the output at the token cap.
   */
  private reserveFor(item: EnrichItem): number {
    const inputTokens = Math.ceil((SYSTEM_PROMPT.length + promptFor(item).length) / 2);
    return callCostUsd(this.cfg.model, inputTokens, this.cfg.maxTokens);
  }

  private async run(item: EnrichItem, hash: string, day: string, key: string, flight: Flight, reserve: number): Promise<void> {
    try {
      const r = await callClaude({
        apiKey: this.cfg.apiKey,
        model: this.cfg.model,
        system: SYSTEM_PROMPT,
        user: promptFor(item),
        maxTokens: this.cfg.maxTokens,
        timeoutMs: this.cfg.timeoutMs,
        fetchImpl: this.opts.fetchImpl,
      });
      this.store.textSpendAdd(day, callCostUsd(this.cfg.model, r.inputTokens, r.outputTokens));
      const v = validateReply(r.text, item.facts, this.cfg.maxChars);
      if (!v.ok) {
        this.reject(v.reason);
        return;
      }
      this.store.textCachePut(item.role, hash, 'en', v.en);
      this.store.textCachePut(item.role, hash, 'fr', v.fr);
      for (const id of flight.ids) this.setOverlay(id, { en: v.en, fr: v.fr });
    } catch (e) {
      this.reject(e instanceof TextCallError ? e.reason : 'network');
    } finally {
      this.reserved.set(day, Math.max(0, (this.reserved.get(day) ?? 0) - reserve));
      this.inflight.delete(key);
    }
  }

  private reject(reason: FallbackReason): void {
    this.rejects[reason]++;
  }

  private setOverlay(id: string, line: OverlayLine): void {
    this.overlayMap.delete(id);
    this.overlayMap.set(id, { line, seq: ++this.seq });
    if (this.overlayMap.size > OVERLAY_KEEP) {
      const oldest = this.overlayMap.keys().next().value;
      if (oldest !== undefined) this.overlayMap.delete(oldest);
    }
  }

  /** Every overlay line kept (a welcome sends all of them). */
  overlay(): Record<string, OverlayLine> {
    return Object.fromEntries([...this.overlayMap].map(([id, e]) => [id, e.line]));
  }

  /** The current overlay version. A connection stores it when it is sent the overlay, and asks for lines after it. */
  version(): number {
    return this.seq;
  }

  /** The lines that landed after a cursor (a connection's last version), or null when none did. */
  since(cursor: number): Record<string, OverlayLine> | null {
    const out: Record<string, OverlayLine> = {};
    let any = false;
    for (const [id, e] of this.overlayMap) {
      if (e.seq > cursor) {
        out[id] = e.line;
        any = true;
      }
    }
    return any ? out : null;
  }

  /** Resolves once every call in flight has settled (tests and shutdown). */
  async settled(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight.values()].map((f) => f.done));
  }

  readout(): TextReadout {
    const now = this.now();
    const day = dayOf(now);
    const rejects = { ...this.rejects };
    const fallbacks = Object.values(rejects).reduce((a, b) => a + b, 0);
    return {
      enabled: this.cfg.enabled,
      provider: this.cfg.enabled ? 'claude' : null,
      model: this.cfg.model,
      roles: [...this.cfg.roles],
      day,
      dailyUsdCap: this.cfg.dailyUsdCap,
      spentToday: this.store.textSpendOn(day),
      reservedToday: this.reserved.get(day) ?? 0,
      calls: this.calls,
      hits: this.hits,
      rejects,
      stops: { ...this.stops },
      fallbacks,
      overlaySize: this.overlayMap.size,
    };
  }
}

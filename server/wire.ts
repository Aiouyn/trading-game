import { publicShortInterest } from '../src/engine';
import { SHORT_INTEREST_EVERY } from '../src/world/core';
import type { GameState } from '../src/world/types';
import { configSeq, marketFrame, type MarketFrame } from '../src/world/view';

/**
 * The public short interest, on the tick stream. The server computes it (the client never sees other accounts' positions,
 * so it cannot), at a slow cadence, and sends it only when the figure changed: a tick's frame carries it on the due
 * ticks that moved, and a welcome always carries the current figure (welcomeFrame). Never per tick, for every stock.
 */
export class ShortInterestWire {
  private sent: string | null = null;

  /** The figure to put in this tick's frame, or null when this tick is not due or nothing changed. Call once per tick. */
  due(g: GameState): Record<string, number | null> | null {
    if (g.market.tick % SHORT_INTEREST_EVERY !== 0) return null;
    const si = publicShortInterest(g.market);
    const json = JSON.stringify(si);
    if (json === this.sent) return null;
    this.sent = json;
    return si;
  }
}

/** The current figure for a welcome: always present, so a new connection never waits for the next change. */
export function welcomeShortInterest(g: GameState): Record<string, number | null> {
  return publicShortInterest(g.market);
}

/**
 * The wire rules for the asset list. The engine appends assets (IPOs, spin-off children) and delists names in place
 * (listed:false, delisted:true), and bumps the list version on every such event. A client's universe must match the
 * frames it reads, so the list rides two paths: the welcome always carries it, and the one tick the version moved
 * carries it on the tick stream. A normal tick carries nothing extra beyond cfgSeq.
 */
export class ListWire {
  /** the list version the tick stream has sent so far */
  private sent: number;
  private defs: { seq: number; json: string } | null = null;

  constructor(g: GameState) {
    this.sent = configSeq(g);
  }

  /** The frame for one tick. Carries the defs on the tick the list changed; call once per tick, in order. */
  tickFrame(g: GameState, withEarnings: boolean): MarketFrame {
    const seq = configSeq(g);
    const changed = seq !== this.sent;
    this.sent = seq;
    return marketFrame(g, withEarnings, changed);
  }

  /** The full asset list as JSON (the welcome's defs), cached per list version. */
  defsJson(g: GameState): string {
    const seq = configSeq(g);
    if (!this.defs || this.defs.seq !== seq) this.defs = { seq, json: JSON.stringify(g.market.config.assets) };
    return this.defs.json;
  }
}

export interface WelcomeParts {
  playerId: string;
  tickMs: number;
  frameJson: string;
  defsJson: string;
  meJson: string;
  pubJson: string;
  directoryJson: string;
  chatJson: string;
  serverTime: number;
}

/** The welcome message: the frame, the full asset list and the player's view, all in one message. */
export function welcomeJson(p: WelcomeParts): string {
  return `{"t":"welcome","playerId":${JSON.stringify(p.playerId)},"tickMs":${p.tickMs},"frame":${p.frameJson},"defs":${p.defsJson},"me":${p.meJson},"pub":${p.pubJson},"directory":${p.directoryJson},"chat":${p.chatJson},"serverTime":${p.serverTime}}`;
}

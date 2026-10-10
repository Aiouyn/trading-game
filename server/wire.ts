import type { GameState } from '../src/world/types';
import { configSeq, marketFrame, type MarketFrame } from '../src/world/view';

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

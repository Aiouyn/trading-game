import type { Fill, RegimeId, StepEvent, WorldState } from '@/engine';
import { clockLabel } from './clock';
import { price, qty, signedPct } from './format';

/** Wire headlines come only from real engine events and the player's own fills (04 §2). */
export type WireKind = 'macro' | 'move' | 'halt' | 'reopen' | 'fill';

export interface WireItem {
  id: string;
  tick: number;
  kind: WireKind;
  tag: string;
  text: string;
  tone: 'gain' | 'loss' | 'warn' | 'info' | 'brass';
  time: string;
}

export const WIRE_KEEP = 40;

const REGIME: Record<RegimeId, string> = {
  expansion: 'expansion',
  overheating: 'overheating',
  contraction: 'contraction',
  recovery: 'recovery',
};

function nameOf(state: WorldState, assetId: string): string {
  return state.config.assets.find((a) => a.id === assetId)?.name ?? assetId;
}

export function wireFromEvents(state: WorldState, events: StepEvent[], fills: Fill[]): WireItem[] {
  const tpd = state.config.ticksPerDay;
  const out: WireItem[] = [];
  events.forEach((e, k) => {
    const base = { id: `${e.tick}-${e.type}-${k}`, tick: e.tick, time: clockLabel(e.tick, tpd) };
    switch (e.type) {
      case 'regime':
        out.push({ ...base, kind: 'macro', tag: 'Macro', tone: 'info',
          text: `The economy turns from ${REGIME[e.from]} to ${REGIME[e.to]}` });
        break;
      case 'jump': {
        const move = Math.exp(e.logSize) - 1;
        out.push({ ...base, kind: 'move', tag: e.assetId, tone: move >= 0 ? 'gain' : 'loss',
          text: `${nameOf(state, e.assetId)} ${move >= 0 ? 'jumps' : 'drops'} ${signedPct(move)} on news` });
        break;
      }
      case 'halt':
        out.push({ ...base, kind: 'halt', tag: 'Halt', tone: 'warn',
          text: `${nameOf(state, e.assetId)} halted after a ${signedPct(e.move)} move` });
        break;
      case 'reopen':
        out.push({ ...base, kind: 'reopen', tag: 'Reopen', tone: e.gap >= 0 ? 'gain' : 'loss',
          text: `${nameOf(state, e.assetId)} reopens ${signedPct(e.gap)}` });
        break;
    }
  });
  fills.forEach((f, k) => {
    out.push({
      id: `${f.tick}-fill-${f.orderId}-${k}`, tick: f.tick, kind: 'fill', tag: 'You', tone: 'brass',
      time: clockLabel(f.tick, tpd),
      text: `${f.side === 'buy' ? 'Bought' : 'Sold'} ${qty(f.qty)} ${f.assetId} at ${price(f.price)}`,
    });
  });
  return out;
}

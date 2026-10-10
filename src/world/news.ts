import type { StepEvent, WorldEventKind } from '@/engine';
import {
  earningsHeadline, macroHeadline, moveHeadline, previewHeadline, ratesHeadline, regimeHeadline, rumorHeadline,
} from '@/content/news';
import { notify, pushWire } from './core';
import type { GameState, StepOutput } from './types';

function defOf(g: GameState, id: string) {
  return g.market.config.assets.find((a) => a.id === id);
}

/** Turn engine events into Wire stories (public) and margin notices (private). */
export function newsFromEvents(g: GameState, events: StepEvent[], out: StepOutput): void {
  for (const e of events) {
    switch (e.type) {
      case 'regime':
        pushWire(g, out, { kind: 'macro', tag: 'Economy', tone: e.to === 'contraction' ? 'loss' : 'info', text: regimeHeadline(e.from, e.to) });
        break;
      case 'jump': {
        const d = defOf(g, e.assetId);
        if (!d || d.listed === false) break;
        const move = Math.exp(e.logSize) - 1;
        pushWire(g, out, {
          kind: 'move', tag: e.assetId, tone: move >= 0 ? 'gain' : 'loss', assetId: e.assetId, news: 'jump',
          text: moveHeadline(e.assetId, d.sector, d.name, move, `${e.tick}:${e.assetId}`),
        });
        break;
      }
      case 'auction': {
        // the closing auction: the trader pools' clearing price replaced the last trade; name the biggest listed mover
        let best: { id: string; m: number } | null = null;
        for (const [id, m] of Object.entries(e.moves)) {
          const d = defOf(g, id);
          if (!d || d.listed === false || d.assetClass === 'forex') continue;
          if (!best || Math.abs(m) > Math.abs(best.m)) best = { id, m };
        }
        if (!best || Math.abs(best.m) < 0.01) break;
        const d = defOf(g, best.id)!;
        pushWire(g, out, {
          kind: 'move', tag: 'Close', tone: best.m >= 0 ? 'gain' : 'loss', assetId: best.id,
          text: `Closing auction: ${d.name} prints ${pctText(best.m)} from its last trade as the big desks square up`,
        });
        break;
      }
      case 'halt': {
        const d = defOf(g, e.assetId);
        if (!d) break;
        pushWire(g, out, { kind: 'halt', tag: 'Halt', tone: 'warn', assetId: e.assetId, text: `${d.name} halted after a ${pctText(e.move)} move; trading resumes in 10 minutes` });
        break;
      }
      case 'reopen': {
        const d = defOf(g, e.assetId);
        if (!d) break;
        pushWire(g, out, { kind: 'reopen', tag: 'Reopen', tone: e.gap >= 0 ? 'gain' : 'loss', assetId: e.assetId, text: `${d.name} reopens ${pctText(e.gap)}` });
        break;
      }
      case 'earnings': {
        const d = defOf(g, e.assetId);
        if (!d) break;
        pushWire(g, out, { kind: 'earnings', tag: 'Earnings', tone: e.move >= 0 ? 'gain' : 'loss', assetId: e.assetId, news: 'earnings', text: earningsHeadline(d.name, e.surprise, e.move) });
        break;
      }
      case 'preview': {
        const d = defOf(g, e.assetId);
        if (!d) break;
        pushWire(g, out, { kind: 'preview', tag: 'Preview', tone: 'info', assetId: e.assetId, text: previewHeadline(d.name, e.consensus, e.daysAway) });
        break;
      }
      case 'rumor': {
        const d = defOf(g, e.assetId);
        if (!d) break;
        pushWire(g, out, { kind: 'rumor', tag: 'Whisper', tone: 'warn', assetId: e.assetId, text: rumorHeadline(d.name, e.direction) });
        break;
      }
      case 'macro':
        pushWire(g, out, { kind: 'macro', tag: e.kind === 'cpi' ? 'Inflation' : 'Jobs', tone: 'info', text: macroHeadline(e.kind, e.actual, e.consensus) });
        break;
      case 'rates':
        pushWire(g, out, { kind: 'rates', tag: 'Central bank', tone: e.change > 0 ? 'loss' : e.change < 0 ? 'gain' : 'info', text: ratesHeadline(e.policy, e.change, e.expected) });
        break;
      case 'listing': {
        const name = defOf(g, e.assetId)?.name ?? e.assetId;
        const px = `$${e.price.toFixed(2)}`;
        if (e.kind === 'ipo') {
          pushWire(g, out, { kind: 'listing', tag: 'IPO', tone: 'info', assetId: e.assetId, text: `${name} lists on Port Avalon at ${px}` });
        } else if (e.kind === 'bankruptcy') {
          pushWire(g, out, { kind: 'listing', tag: 'Bankruptcy', tone: 'loss', assetId: e.assetId, text: `${name} files for bankruptcy; holders recover ${px} a share in cash` });
        } else if (e.kind === 'merger') {
          pushWire(g, out, { kind: 'listing', tag: 'Takeover', tone: 'gain', assetId: e.assetId, text: `${name} agrees to a cash takeover at ${px} a share; trading stops` });
        } else {
          const child = defOf(g, e.otherId ?? '')?.name ?? e.otherId ?? 'a new company';
          pushWire(g, out, { kind: 'listing', tag: 'Spin-off', tone: 'info', assetId: e.assetId, text: `${name} spins off ${child}; holders receive shares in the new company` });
        }
        break;
      }
      case 'world': {
        if (e.phase === 'announced') {
          for (const p of e.precursors ?? []) pushWire(g, out, { kind: 'world', tag: 'Markets', tone: 'warn', text: p, ev: { type: 'world', id: e.id, phase: 'announced', kind: e.kind } });
        } else if (e.phase === 'start') {
          pushWire(g, out, { kind: 'world', tag: worldLabel(e.kind), tone: worldTone(e.kind), text: e.headline, ev: { type: 'world', id: e.id, phase: 'start', kind: e.kind } });
        } else {
          const lasted = e.kind === 'flash' ? '' : ` · lasted ${e.lastedDays} day${e.lastedDays === 1 ? '' : 's'}`;
          const gx = e.gxMove !== undefined ? ` · GX ${pctText(e.gxMove)}` : '';
          pushWire(g, out, {
            kind: 'world', tag: worldLabel(e.kind), tone: 'info', text: `${worldLabel(e.kind)} ended${lasted}${gx}`,
            ev: { type: 'world', id: e.id, phase: 'end', kind: e.kind, lastedDays: e.lastedDays, gxMove: e.gxMove },
          });
        }
        break;
      }
      case 'margin_call':
        notify(g, out, e.playerId, { kind: 'margin', tone: 'warn', text: `Margin call: equity $${Math.round(e.equity).toLocaleString('en-US')} is below the $${Math.round(e.required).toLocaleString('en-US')} requirement. Add cash or cut positions before you are liquidated.` });
        break;
      case 'liquidation': {
        const p = g.players[e.playerId];
        if (p) p.stats.liquidations++;
        notify(g, out, e.playerId, { kind: 'margin', tone: 'loss', text: `Liquidated: the broker closed ${e.qty} ${e.assetId} at ${e.price.toFixed(2)} to cover your margin.` });
        pushWire(g, out, { kind: 'liquidation', tag: 'Margin', tone: 'loss', assetId: e.assetId, text: `Forced selling: a leveraged trader is liquidated in ${e.assetId}` });
        break;
      }
      case 'index': {
        const nm = g.market.config.indices.find((x) => x.id === e.indexId)?.name ?? e.indexId;
        const names = (ids: string[]) => ids.map((id) => defOf(g, id)?.name ?? id).join(', ');
        const moves = [e.adds.length ? `joins ${names(e.adds)}` : '', e.removes.length ? `leaves ${names(e.removes)}` : ''].filter(Boolean).join('; ');
        if (e.phase === 'announced') {
          const tpd = g.market.config.ticksPerDay;
          const away = Math.max(1, e.day - Math.floor((e.tick - 1) / tpd));
          pushWire(g, out, {
            kind: 'index', tag: 'Index', tone: 'info', text: `${nm} reviews its members in ${away} day${away === 1 ? '' : 's'}: ${moves}`,
            ev: { type: 'index', id: `${e.indexId}:${e.day}`, phase: 'announced', indexId: e.indexId, day: e.day, adds: e.adds, removes: e.removes },
          });
        } else {
          pushWire(g, out, {
            kind: 'index', tag: 'Index', tone: 'info', text: `${nm} reconstitutes today: ${moves}. Pension funds rebalance into the new weights`,
            ev: { type: 'index', id: `${e.indexId}:${e.day}`, phase: 'effective', indexId: e.indexId, day: e.day, adds: e.adds, removes: e.removes },
          });
        }
        break;
      }
      case 'squeeze': {
        const d = defOf(g, e.assetId);
        if (!d) break;
        pushWire(g, out, {
          kind: 'squeeze', tag: 'Squeeze', tone: 'warn', assetId: e.assetId,
          text: `Short squeeze in ${d.name}: forced buying to cover shorts reached ${(e.cover * 100).toFixed(0)}% of a day's volume`,
        });
        break;
      }
      case 'option_expiry':
        notify(g, out, e.playerId, { kind: 'fill', tone: e.payout > 0 ? 'gain' : 'loss', text: e.payout > 0 ? `Option ${e.contractId.replace(/\|/g, ' ')} expired in the money: +$${Math.round(e.payout).toLocaleString('en-US')}` : `Option ${e.contractId.replace(/\|/g, ' ')} expired worthless` });
        break;
    }
  }
}

function worldLabel(kind: WorldEventKind): string {
  return kind === 'crash' ? 'Crash' : kind === 'bubble' ? 'Bubble' : kind === 'crisis' ? 'Crisis week' : 'Flash crash';
}

function worldTone(kind: WorldEventKind): 'gain' | 'loss' | 'warn' | 'info' {
  return kind === 'crash' ? 'loss' : kind === 'bubble' ? 'gain' : kind === 'crisis' ? 'warn' : 'info';
}

function pctText(f: number): string {
  return `${f >= 0 ? '+' : '−'}${(Math.abs(f) * 100).toFixed(1)}%`;
}

/** Public whale filings (bible 02): holding ≥ 0.5%, 1%, 2%, 5%… of a company is disclosed. */
const FILING_LEVELS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2];

export function filings(g: GameState, playerId: string, out: StepOutput): void {
  const acct = g.market.accounts[playerId];
  const p = g.players[playerId];
  if (!acct || !p) return;
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    const def = defOf(g, assetId);
    if (!def || def.assetClass !== 'stock' || !def.sharesOutstanding) continue;
    const frac = Math.abs(pos.qty) / def.sharesOutstanding;
    let level = 0;
    for (const l of FILING_LEVELS) if (frac >= l) level = l;
    const prev = p.filings[assetId] ?? 0;
    if (level > prev) {
      p.filings[assetId] = level;
      pushWire(g, out, {
        kind: 'filing', tag: 'Filing', tone: 'brass', assetId, playerId,
        text: `${p.handle} discloses a ${pos.qty < 0 ? 'short' : ''}${pos.qty < 0 ? ' position of' : 'stake of'} ${(level * 100).toFixed(1)}% in ${def.name}`,
      });
    } else if (level < prev) {
      p.filings[assetId] = level;
    }
  }
}

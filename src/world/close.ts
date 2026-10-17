import { indexLevel, newsBand, type Account, type NewsBand } from '@/engine';
import { CLOSE_STORIES, LEDGER } from '@/content/learning';
import { TPD, notify, today } from './core';
import { advanceGhosts, beatenCount, ghostValues, percentileOf } from './ghosts';
import { ensureLedger, hasTrades, ledgerOf, priceEquity, valuationAndIncome } from './ledger';
import { textProvider, type Msg } from './text';
import { signedUsdToken, usdToken } from '@/i18n/tokens';
import type { BizDay, DailyClose, DayClose, DayRecord, PlayerLedger } from './ledger-types';
import type { GameState, StepOutput, WireItem } from './types';

/**
 * The daily close (Phase 3, D-7): at each game day's close the world records the day (GX and every asset's close), each
 * human player's day (liquidation-value net worth, equity, positions and the benchmark ghosts), and builds that player's
 * card. An online player gets the card on their next view; an offline player also gets one inbox line. Pure reads of the
 * stored records: `dayClose` only assembles facts and asks the text provider for the lines.
 */

/** Listed, tradable stocks (the sector movers' universe). */
function listedStockDefs(g: GameState) {
  return g.market.config.assets.filter((a) => a.assetClass === 'stock' && a.listed !== false && !a.delisted);
}

/** Record one closed day's market: GX and every asset's close (mid), kept LEDGER.dayCloseKeep days. */
export function recordDayClose(g: GameState, day: number, tick: number): void {
  const px: Record<string, number> = {};
  g.market.config.assets.forEach((a, i) => { px[a.id] = Math.exp(g.market.assets[i]!.lnP); });
  g.dayCloses ??= {};
  const rec: DayClose = { day, tick, gx: indexLevel(g.market, 'GX'), px };
  g.dayCloses[day] = rec;
  for (const k of Object.keys(g.dayCloses)) if (Number(k) < day - LEDGER.dayCloseKeep) delete g.dayCloses[Number(k)];
}

/** Wire items of one closed day: those after the day's open tick, up to and including its close tick. */
function dayWire(g: GameState, day: number): WireItem[] {
  const lo = day * TPD;
  const hi = (day + 1) * TPD;
  return g.wire.filter((w) => w.tick > lo && w.tick <= hi);
}

/**
 * The card for one player and one closed day, from the stored records. Null when a record is missing (the first close of
 * a fresh world, before the day's record exists). Pure: it reads, never writes.
 */
export function dayClose(g: GameState, playerId: string, day: number): DailyClose | null {
  const L = ledgerOf(g, playerId);
  const cur = L?.days[day];
  const prev = L?.days[day - 1];
  const dc = g.dayCloses?.[day];
  const dp = g.dayCloses?.[day - 1];
  if (!L || !cur || !dc) return null;
  const cfg = g.market.config;
  const closeTick = dc.tick;

  // the card counts trading and income: the grants, transfers and loans that came in during the day are taken out
  const nwOpen = prev?.nw ?? cur.nw;
  // a record saved before `ext` existed has no baseline to subtract from, so its day counts as before
  const extDay = prev && cur.ext !== undefined && prev.ext !== undefined ? cur.ext - prev.ext : 0;
  const nwChange = cur.nw - nwOpen - extDay;
  // the return is against the prior close's equity plus the external cash in during the day (ruling in docs/V1-PHASE10.md,
  // 10D.1): a grant credited mid-day is capital, and a base without it would turn the gains on that capital into a percentage
  // of money the player never held. The header's day figure has the same base (dayStart moves with the grant).
  const nwBase = nwOpen + extDay;
  const nwChangePct = nwBase > 0 ? nwChange / nwBase : 0;
  // the split of that change: valuation and income come from the stored day records (both closes must carry them, else the
  // day predates the split and all of it counts as trading); the business tax is booked to its own sink, so it sits in the
  // rest of the change: it is taken out of trading and shown as its own row (R-9-10). Trading is what is left, so the four
  // parts sum to the change. Valuation is a re-mark only: the cash the day converted into holdings (a purchase, a deposit)
  // or took out of them (a sale) is taken out of it, so a conversion is neither trading nor valuation (Player.assetFlow)
  const split = !!prev && prev.val !== undefined && prev.inc !== undefined && cur.val !== undefined && cur.inc !== undefined;
  const converted = split && prev!.flow !== undefined && cur.flow !== undefined ? cur.flow - prev!.flow : 0;
  const valuation = split ? cur.val! - prev!.val! - converted : 0;
  const income = split ? cur.inc! - prev!.inc! : 0;
  const bizTax = cur.biz?.tax ?? 0;
  const trading = nwChange - valuation - income + bizTax;

  // best and worst positions: the quantity held at the open (the previous close), and the day's price change on it
  let best: DailyClose['best'] = null;
  let worst: DailyClose['worst'] = null;
  if (dp && prev) {
    for (const [id, q] of Object.entries(prev.qty)) {
      const p0 = dp.px[id];
      const p1 = dc.px[id];
      if (!q || !(p0 && p0 > 0) || p1 === undefined) continue;
      const line = { assetId: id, pct: p1 / p0 - 1, usd: q * (p1 - p0) };
      if (!best || line.usd > best.usd) best = line;
      if (!worst || line.usd < worst.usd) worst = line;
    }
  }

  const gxPct = dp && dp.gx > 0 ? dc.gx / dp.gx - 1 : 0;

  // sector movers: the equal-weight day return of each sector's listed stocks
  let sectors: DailyClose['sectors'] = null;
  if (dp) {
    const acc = new Map<string, { sum: number; n: number }>();
    for (const a of listedStockDefs(g)) {
      const p0 = dp.px[a.id];
      const p1 = dc.px[a.id];
      if (!(p0 && p0 > 0) || p1 === undefined) continue;
      const s = acc.get(a.sector) ?? { sum: 0, n: 0 };
      s.sum += p1 / p0 - 1;
      s.n++;
      acc.set(a.sector, s);
    }
    const ranked = [...acc.entries()].map(([sector, s]) => ({ sector, pct: s.sum / s.n })).sort((x, y) => y.pct - x.pct || x.sector.localeCompare(y.sector));
    if (ranked.length) sectors = { best: ranked[0]!, worst: ranked[ranked.length - 1]! };
  }

  // priced-in chips for the day's stories: the band only (never the share), and "done" carries no chip
  const wires = dayWire(g, day);
  const stories: DailyClose['stories'] = [];
  for (const w of wires) {
    if (!w.news || !w.assetId) continue;
    const band: NewsBand = newsBand(cfg, w.assetId, w.news, closeTick - w.tick);
    if (band === 'done') continue;
    stories.push({ assetId: w.assetId, headline: w.text, ...(w.msg ? { headlineMsg: w.msg } : {}), band });
    if (stories.length >= CLOSE_STORIES) break;
  }

  // the event line: an active world event shows its headline; an ended one adds its duration (never before it ends)
  let event: DailyClose['event'] = null;
  const ev = wires.find((w) => w.ev?.type === 'world' && (w.ev.phase === 'start' || w.ev.phase === 'end'));
  if (ev?.ev) {
    event = ev.ev.phase === 'end'
      ? { phase: 'ended', headline: ev.text, ...(ev.msg ? { headlineMsg: ev.msg } : {}), lastedDays: ev.ev.lastedDays ?? 0 }
      : { phase: 'active', headline: ev.text, ...(ev.msg ? { headlineMsg: ev.msg } : {}) };
  }

  const ghosts = cur.ghosts;
  const beaten = beatenCount(cur.equity, ghosts);
  const noTrades = !hasTrades(g, playerId);
  const base: Omit<DailyClose, 'lines'> = {
    day, offline: !g.players[playerId]?.online, nwOpen, nwClose: cur.nw, nwChange, nwChangePct, trading, valuation, income, tax: bizTax ? -bizTax : 0, external: extDay, best, worst, gx: { pct: gxPct }, sectors, stories, event,
    biz: cur.biz ?? null,
    ghosts: {
      player: cur.equity, basket: ghosts.basket, random: ghosts.random, momentum: ghosts.momentum, beaten,
      percentile: noTrades ? null : percentileOf(beaten),
    },
  };
  return { ...base, lines: textProvider.dailyClose(base) };
}

function capped<T>(xs: T[], keep: number): void {
  if (xs.length > keep) xs.length = keep;
}

/** The record of one player's day: the mark, the equity, the positions at the close and the ghost values. */
function dayRecord(g: GameState, L: PlayerLedger, pid: string, day: number, biz?: BizDay): DayRecord | null {
  const p = g.players[pid];
  const acct: Account | undefined = g.market.accounts[pid];
  if (!p || !acct) return null;
  const qty: Record<string, number> = {};
  for (const [id, pos] of Object.entries(acct.positions)) if (pos.qty !== 0) qty[id] = pos.qty;
  // the mid total (p.netWorth): the same basis as the header and the Portfolio. The liquidation mark (markNetWorth) is the rank
  // basis only; a day's return on it would charge the exit haircut to a day that did not trade
  return { day, nw: p.netWorth, equity: priceEquity(g, pid, L), qty, ghosts: ghostValues(g, L, day), ext: p.externalCash ?? 0, ...valuationAndIncome(g, pid), flow: p.assetFlow ?? 0, ...(biz ? { biz } : {}) };
}

/**
 * The close hook, run once per game day at the day's last tick (after the net worth refresh): record the day, advance
 * the ghosts, store each human player's day and card, and queue a line to the inbox for an offline player.
 */
export function closeDay(g: GameState, out: StepOutput | null, bizTax?: Map<string, BizDay>): void {
  const day = today(g);
  recordDayClose(g, day, g.market.tick);
  const humans = Object.values(g.players).filter((p) => !p.npc);
  const ledgers: [string, PlayerLedger][] = [];
  for (const p of humans) {
    const L = ensureLedger(g, p.id);
    if (!L) continue;
    advanceGhosts(g, p.id, day);
    ledgers.push([p.id, L]);
  }
  for (const [pid, L] of ledgers) {
    const rec = dayRecord(g, L, pid, day, bizTax?.get(pid));
    if (rec) L.days[day] = rec;
    // kept for the ghost lines on the net worth chart (the view shows the last 60 closed days)
    for (const k of Object.keys(L.days)) if (Number(k) < day - LEDGER.dayCloseKeep) delete L.days[Number(k)];
  }
  for (const [pid, L] of ledgers) {
    const card = dayClose(g, pid, day);
    if (!card) continue;
    const { lines: _lines, ...stored } = card;
    void _lines;
    L.closes.unshift(stored);
    capped(L.closes, LEDGER.closesKeep);
    const p = g.players[pid]!;
    if (!p.online) {
      const vars = { day: day + 1, now: usdToken(card.nwClose), change: signedUsdToken(card.nwChange) };
      const msg: Msg = { key: 'dayclose.inbox', vars };
      notify(g, out, pid, { kind: 'close', tone: card.nwChange >= 0 ? 'gain' : 'loss', text: textProvider.render(msg, 'en'), msg, day });
    }
  }
}


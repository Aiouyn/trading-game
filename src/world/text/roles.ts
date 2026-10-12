import type { Msg } from '@/i18n';
import { earningsGrade, hashStr } from '@/content/news';

/**
 * The text roles' copy rules (Phase 7, P7-1). A role takes typed FACTS (ids, names, numbers and signs the world already
 * decided) and returns a Msg; it never reads or writes world state and never picks a figure. Every message type has
 * VARIANTS templates per locale (`<type>.0` .. `<type>.7` in en.json and fr.json), and the variant is chosen by a stable hash
 * of the fact's id, so no world RNG stream is read and prices, streams and replays never move.
 */

/** Templates per message type, per locale. */
export const VARIANTS = 8;

/** The variant a fact id picks (FNV-1a, the same hash the Wire's move headlines always used). */
export function variantOf(factId: string): number {
  return hashStr(factId) % VARIANTS;
}

/** The key of one variant of a message type, for a fact id. */
export function vkey(base: string, factId: string): string {
  return `${base}.${variantOf(factId)}`;
}

/** A signed percent with one decimal and the Wire's minus sign (+1.2%, −3.4%). */
export function wirePct(f: number): string {
  return `${f >= 0 ? '+' : '−'}${(Math.abs(f) * 100).toFixed(1)}%`;
}

/** An unsigned percent with one decimal, from a fraction. */
export function plainPct(f: number): string {
  return `${(f * 100).toFixed(1)}%`;
}

/** A whole dollar amount with thousands separated (en-US form in both languages, as the ledger prints it). */
export function usd0(x: number): string {
  return `$${Math.round(x).toLocaleString('en-US')}`;
}

/** The "when" phrase of a days-away count: tomorrow, or in N days (plural by count). */
export function whenDays(n: number, tomorrow = false): Msg {
  if (tomorrow && n === 1) return { key: 'txt.news.when.tomorrow' };
  return { key: 'txt.news.when.days', vars: { count: n, n } };
}

// ---------------------------------------------------------------------------------------------------------------------
// newsroom: the Wire, the margin notices and the world's stories, from cause facts

export type NewsFacts =
  | { kind: 'regime'; id: string; from: string; to: string }
  | { kind: 'move'; id: string; name: string; move: number }
  | { kind: 'auction'; id: string; name: string; move: number }
  | { kind: 'halt'; id: string; name: string; move: number }
  | { kind: 'reopen'; id: string; name: string; gap: number }
  | { kind: 'earnings'; id: string; name: string; surprise: number; move: number; quote: Msg }
  | { kind: 'preview'; id: string; name: string; consensus: number; daysAway: number }
  | { kind: 'macro'; id: string; macro: 'cpi' | 'jobs'; actual: number; consensus: number; diff: number }
  | { kind: 'rates'; id: string; policy: number; change: number; expected: number }
  | { kind: 'listing'; id: string; event: 'ipo' | 'bankruptcy' | 'merger' | 'spinoff'; name: string; price: number; child: string }
  | { kind: 'index'; id: string; phase: 'announced' | 'effective'; index: string; days: number; adds: string[]; removes: string[] }
  | { kind: 'squeeze'; id: string; name: string; cover: number }
  | { kind: 'filing'; id: string; handle: string; name: string; level: number }
  | { kind: 'margin'; id: string; equity: number; required: number }
  | { kind: 'liquidated'; id: string; qty: number; asset: string; price: number }
  | { kind: 'liquidation'; id: string; asset: string }
  | { kind: 'option'; id: string; contract: string; payout: number }
  | { kind: 'sale'; id: string; name: string; price: number }
  | { kind: 'deal'; id: string; handle: string; biz: string; city: string }
  | { kind: 'property'; id: string; handle: string; type: string; district: string; city: string }
  | { kind: 'bizEvent'; id: string; event: string; biz: string; city: string; mult: number; days: number }
  | { kind: 'chapter'; id: string; number: number; winner: string | null }
  | { kind: 'hallOfFame'; id: string; rank: number; number: number }
  | { kind: 'priced'; id: string; name: string; ticker: string; price: number }
  | { kind: 'tradePlan'; id: string; name: string; from: number; to: number }
  | { kind: 'buyback'; id: string; name: string; size: number; from: number; to: number }
  | { kind: 'lawsuit'; id: string; handle: string; defendant: string; law: string }
  | { kind: 'verdict'; id: string; defendant: string; plaintiff: string; law: string };

/** The court's claim kind as a fragment (en.json txt.court.kind.*); a kind with no fragment shows as it is. */
const LAW_SLUG: Record<string, string> = { 'cyber intrusion': 'cyber', 'model theft': 'model', 'loan default': 'loan', 'contract breach': 'contract', 'fund abuse': 'fund' };
function lawMsg(law: string): Msg {
  return LAW_SLUG[law] ? { key: `txt.court.kind.${LAW_SLUG[law]}` } : { key: law };
}

/** The threshold a macro print must clear to read as hot or cool (the engine's own band). */
const MACRO_BAND = 0.0007;

/** The surprise band of a rates decision, in basis points (the same rounding the engine's headline used). */
function rateSurprise(change: number, expected: number): 'hawkish' | 'dovish' | 'expected' {
  const s = Math.round((change - expected) * 1e4);
  return s === 0 ? 'expected' : s > 0 ? 'hawkish' : 'dovish';
}

function changeMsg(adds: string[], removes: string[]): Msg {
  const joins = adds.length ? ({ key: 'txt.news.change.joins', vars: { names: adds.join(', ') } } as Msg) : null;
  const leaves = removes.length ? ({ key: 'txt.news.change.leaves', vars: { names: removes.join(', ') } } as Msg) : null;
  if (joins && leaves) return { key: 'txt.news.change.both', vars: { joins, leaves } };
  return joins ?? leaves ?? { key: 'txt.news.change.none' };
}

export function newsroomMsg(f: NewsFacts): Msg {
  switch (f.kind) {
    case 'regime':
      if (['expansion', 'overheating', 'contraction', 'recovery'].includes(f.to)) return { key: vkey(`txt.news.regime.${f.to}`, f.id) };
      return { key: vkey('txt.news.regime.other', f.id), vars: { from: f.from, to: f.to } };
    case 'move':
      return { key: vkey(`txt.news.move.${f.move >= 0 ? 'up' : 'down'}`, f.id), vars: { name: f.name, move: wirePct(f.move) } };
    case 'auction':
      return { key: vkey('txt.news.auction', f.id), vars: { name: f.name, move: wirePct(f.move) } };
    case 'halt':
      return { key: vkey('txt.news.halt', f.id), vars: { name: f.name, move: wirePct(f.move) } };
    case 'reopen':
      return { key: vkey(`txt.news.reopen.${f.gap >= 0 ? 'up' : 'down'}`, f.id), vars: { name: f.name, gap: wirePct(f.gap) } };
    case 'earnings': {
      const g = earningsGrade(f.surprise);
      const tone = g === 'A+' || g === 'A' || g === 'B' ? 'beat' : g === 'C' ? 'inline' : 'miss';
      return { key: vkey(`txt.news.earnings.${tone}`, f.id), vars: { name: f.name, grade: g, move: wirePct(f.move), quote: f.quote } };
    }
    case 'preview': {
      const lean = f.consensus > 0 ? 'beat' : 'miss';
      const a = Math.abs(f.consensus);
      const when = whenDays(f.daysAway, true);
      if (a < 0.15) return { key: vkey('txt.news.preview.split', f.id), vars: { name: f.name, when } };
      const stars = a > 0.6 ? 3 : a > 0.35 ? 2 : 1;
      const conv: Msg = { key: `txt.news.conv.${stars === 3 ? 'strong' : stars === 2 ? 'mid' : 'weak'}` };
      return { key: vkey(`txt.news.preview.${lean}`, f.id), vars: { name: f.name, when, conv } };
    }
    case 'macro': {
      const verdict = f.diff > MACRO_BAND ? 'hot' : f.diff < -MACRO_BAND ? 'cool' : 'inline';
      return { key: vkey(`txt.news.macro.${f.macro}.${verdict}`, f.id), vars: { actual: plainPct(f.actual), consensus: plainPct(f.consensus) } };
    }
    case 'rates': {
      const bp = Math.round(f.change * 1e4);
      const verb = bp > 0 ? 'hike' : bp < 0 ? 'cut' : 'hold';
      return {
        key: vkey(`txt.news.rates.${verb}`, f.id),
        vars: { bp: Math.abs(bp), policy: `${(f.policy * 100).toFixed(2)}%`, surprise: { key: `txt.news.surprise.${rateSurprise(f.change, f.expected)}` } },
      };
    }
    case 'listing':
      return { key: vkey(`txt.news.listing.${f.event}`, f.id), vars: { name: f.name, px: `$${f.price.toFixed(2)}`, child: f.child } };
    case 'index':
      if (f.phase === 'announced') {
        return { key: vkey('txt.news.index.announced', f.id), vars: { index: f.index, when: whenDays(f.days), change: changeMsg(f.adds, f.removes) } };
      }
      return { key: vkey('txt.news.index.effective', f.id), vars: { index: f.index, change: changeMsg(f.adds, f.removes) } };
    case 'squeeze':
      return { key: vkey('txt.news.squeeze', f.id), vars: { name: f.name, pct: `${(f.cover * 100).toFixed(0)}%` } };
    case 'filing':
      return { key: vkey('txt.news.filing', f.id), vars: { handle: f.handle, name: f.name, pct: `${(f.level * 100).toFixed(1)}%` } };
    case 'margin':
      return { key: vkey('txt.news.margin', f.id), vars: { equity: usd0(f.equity), required: usd0(f.required) } };
    case 'liquidated':
      return { key: vkey('txt.news.liquidated', f.id), vars: { qty: f.qty, asset: f.asset, price: f.price.toFixed(2) } };
    case 'liquidation':
      return { key: vkey('txt.news.liquidation', f.id), vars: { asset: f.asset } };
    case 'option':
      return {
        key: vkey(`txt.news.option.${f.payout > 0 ? 'itm' : 'otm'}`, f.id),
        vars: { contract: f.contract.replace(/\|/g, ' '), amount: usd0(f.payout) },
      };
    case 'sale':
      return { key: vkey('txt.news.sale', f.id), vars: { name: f.name, price: usd0(f.price) } };
    case 'deal':
      return { key: vkey('txt.news.deal', f.id), vars: { handle: f.handle, biz: f.biz, city: f.city } };
    case 'property':
      return { key: vkey('txt.news.property', f.id), vars: { handle: f.handle, type: f.type, district: f.district, city: f.city } };
    case 'bizEvent': {
      const sign = f.mult >= 1 ? '+' : '−';
      return {
        key: vkey('txt.news.bizEvent', f.id),
        vars: {
          event: { key: `txt.biz.ev.${f.event}`, vars: { biz: f.biz, city: f.city } },
          mult: `${sign}${Math.round(Math.abs(f.mult - 1) * 100)}%`,
          days: { key: 'txt.news.days', vars: { count: f.days, n: f.days } },
        },
      };
    }
    case 'chapter': {
      const vars = { number: f.number, next: f.number + 1 };
      return f.winner
        ? { key: vkey('txt.news.chapter.win', f.id), vars: { ...vars, name: f.winner } }
        : { key: vkey('txt.news.chapter.nowin', f.id), vars };
    }
    case 'hallOfFame':
      return { key: vkey('txt.news.hof', f.id), vars: { rank: f.rank, number: f.number } };
    case 'priced':
      return { key: vkey('txt.news.ipoPriced', f.id), vars: { name: f.name, ticker: f.ticker, price: `$${f.price.toFixed(2)}` } };
    case 'tradePlan':
      return { key: vkey('txt.news.plan', f.id), vars: { name: f.name, from: f.from, to: f.to } };
    case 'buyback':
      return { key: vkey('txt.news.buyback', f.id), vars: { name: f.name, size: f.size, from: f.from, to: f.to } };
    case 'lawsuit':
      return { key: vkey('txt.news.sue', f.id), vars: { handle: f.handle, defendant: f.defendant, law: lawMsg(f.law) } };
    case 'verdict':
      return { key: vkey('txt.news.verdict', f.id), vars: { defendant: f.defendant, plaintiff: f.plaintiff, law: lawMsg(f.law) } };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// narrator: the daily close card's lines (the masthead and the story and event lines are the Wire's and the world's)

export type NarratorFacts =
  | { id: string; kind: 'head'; move: 'up' | 'down' | 'flat'; amount: string }
  | { id: string; kind: 'best' | 'worst'; asset: string; pct: string; usd: string }
  | { id: string; kind: 'noPositions' }
  | { id: string; kind: 'gx'; pct: string }
  | { id: string; kind: 'sector'; which: 'best' | 'worst'; sector: string; pct: string }
  | { id: string; kind: 'ghosts'; basket: string; random: string; momentum: string; player: string }
  | { id: string; kind: 'noTrades' }
  | { id: string; kind: 'rank'; beaten: number };

export function narratorMsg(f: NarratorFacts): Msg {
  switch (f.kind) {
    case 'head':
      return f.move === 'flat' ? { key: vkey('txt.narr.head.flat', f.id) } : { key: vkey(`txt.narr.head.${f.move}`, f.id), vars: { amount: f.amount } };
    case 'best':
    case 'worst':
      return { key: vkey(`txt.narr.${f.kind}`, f.id), vars: { asset: f.asset, pct: f.pct, usd: f.usd } };
    case 'noPositions':
      return { key: vkey('txt.narr.noPositions', f.id) };
    case 'gx':
      return { key: vkey('txt.narr.gx', f.id), vars: { pct: f.pct } };
    case 'sector':
      return { key: vkey(`txt.narr.sector${f.which === 'best' ? 'Best' : 'Worst'}`, f.id), vars: { sector: f.sector, pct: f.pct } };
    case 'ghosts':
      return { key: vkey('txt.narr.ghosts', f.id), vars: { basket: f.basket, random: f.random, momentum: f.momentum, player: f.player } };
    case 'noTrades':
      return { key: vkey('txt.narr.noTrades', f.id) };
    case 'rank':
      return { key: vkey('txt.narr.rank', f.id), vars: { beaten: f.beaten } };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// executives: a CEO's quote on an earnings print, from the surprise's sign and size band

export interface ExecFacts { id: string; name: string; surprise: number }

export function executivesMsg(f: ExecFacts): Msg {
  const s = f.surprise;
  const tone = s >= 0.75 ? 'great' : s >= 0.25 ? 'good' : s > -0.25 ? 'flat' : s > -0.75 ? 'bad' : 'awful';
  return { key: vkey(`txt.exec.${tone}`, f.id), vars: { name: f.name } };
}

// ---------------------------------------------------------------------------------------------------------------------
// rumor mill: a whisper with a source; the accuracy stays the world's (the direction is decided before the copy)

export interface RumorFacts { id: string; name: string; direction: 1 | -1 }

export function rumorMsg(f: RumorFacts): Msg {
  const source: Msg = { key: `txt.rumor.source.${variantOf(`${f.id}:source`)}` };
  return { key: vkey(f.direction > 0 ? 'txt.rumor.hot' : 'txt.rumor.cold', f.id), vars: { name: f.name, source } };
}

// ---------------------------------------------------------------------------------------------------------------------
// rival personas: one voice per fund, from its past performance only (never a position or an intention)

export interface RivalFacts { id: string; day: number; pastPct: number }

export function rivalMsg(f: RivalFacts): Msg {
  const dir = f.pastPct >= 0 ? 'up' : 'down';
  return { key: vkey(`txt.rival.${f.id}.${dir}`, `${f.id}:${f.day}`), vars: { pct: `${Math.abs(f.pastPct * 100).toFixed(1)}%` } };
}

// ---------------------------------------------------------------------------------------------------------------------
// analyst: the Research Desk memo, from a dossier's past facts (the Phase 3 rule: no forecast, no advice)

export type MemoFacts =
  | { id: string; kind: 'move'; dir: 'up' | 'down' | 'flat'; asset: string; pct: number; from: number; to: number }
  | { id: string; kind: 'did'; part: string }
  | { id: string; kind: 'flow'; buying: boolean; pool: string };

export function analystMsg(f: MemoFacts): Msg {
  switch (f.kind) {
    case 'move':
      return { key: vkey(`txt.analyst.${f.dir}`, f.id), vars: { asset: f.asset, pct: `${(Math.abs(f.pct) * 100).toFixed(2)}%`, from: f.from, to: f.to } };
    case 'did':
      return { key: vkey('txt.analyst.did', f.id), vars: { part: `@journal.part.${f.part}` } };
    case 'flow':
      return { key: vkey(`txt.analyst.flow.${f.buying ? 'buy' : 'sell'}`, f.id), vars: { pool: `@desk.pool.${f.pool}` } };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// moderator: the Launchpad's name check, one line per refusal reason (moderate.ts keeps the rules)

export type ModFacts = { id: string; reason: 'abuse' | 'crypto' | 'brand' | 'figure' | 'taken'; name: string };

export function moderatorMsg(f: ModFacts): Msg {
  return { key: vkey(`txt.mod.${f.reason}`, f.id), vars: { name: f.name } };
}

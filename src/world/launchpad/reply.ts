import type { CommandResult, GameState, StepOutput } from '../types';
import { LP } from './constants';
import { anonOf } from './anon';
import { tickerHash } from './icon';
import { moderateText, type TextRefusal } from './moderate';
import { refuse, tokenOf } from './state';
import type { LpReply, LpToken } from './types';
import { LP_NPC_HANDLES, LP_NPC_REPLY_POOLS } from '../text/lpReplies';

/**
 * The replies thread of a token (R-10-6, Phase 10). A player posts up to 140 characters of plain text, moderated (no link, no abusive
 * word, not empty), at most one reply a real minute on a token. The creator's replies are marked as the creator's. NPC replies come
 * from the text layer's templates under fictional handles: deterministic (a hash of the token and the tick, not a stream draw, so a
 * replay is byte-identical and no other draw moves), and rate-limited (one every five real minutes at most, only while the token
 * still trades).
 */

const REFUSAL_CODE: Record<TextRefusal, string> = { empty: 'replyEmpty', long: 'replyLong', link: 'replyLink', abuse: 'replyAbuse' };

/** The replies ever posted on a token (review fix, Phase 10): the running count, not the kept thread's length. */
export function repliesOf(t: LpToken): number {
  return t.replyCount ?? t.replies?.length ?? 0;
}

/** Pushes a reply, counts it, and keeps the newest REPLY_KEEP. */
export function pushReply(t: LpToken, r: LpReply): void {
  t.replyCount = repliesOf(t) + 1;
  const list = t.replies ?? (t.replies = []);
  list.push(r);
  if (list.length > LP.REPLY_KEEP) list.splice(0, list.length - LP.REPLY_KEEP);
}

/** A player's reply on a token. Refusals are three-part, and a refused reply changes nothing. */
export function replyToken(g: GameState, pid: string, ticker: string, text: string, out: StepOutput | null): CommandResult {
  void out;
  const p = g.players[pid];
  if (!p || p.npc) return refuse('noPlayer', {});
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  // a dead token has no thread any more (review fix, Phase 10): it no longer trades, so nobody is replying to it
  if (t.status === 'dead') return refuse('replyDead', { ticker });
  const m = moderateText(text, LP.REPLY_MAX);
  if (!m.ok) return refuse(REFUSAL_CODE[m.reason], { max: LP.REPLY_MAX });
  const tick = g.market.tick;
  const last = t.replyLast?.[pid];
  if (last !== undefined && tick - last < LP.REPLY_COOLDOWN_TICKS) {
    return refuse('replyCooldown', { min: Math.max(1, Math.ceil((LP.REPLY_COOLDOWN_TICKS - (tick - last)) / 12)) });
  }
  const creator = pid === t.creatorId;
  pushReply(t, { tick, who: anonOf(t.ticker, pid), role: creator ? 'creator' : 'player', text: m.text });
  t.replyLast = { ...(t.replyLast ?? {}), [pid]: tick };
  // Attention only. This tick does not trade. A token with no funded traders changes nothing economic.
  armAttention(t, tick, repliesOf(t));
  return { ok: true, data: { tick, text: m.text } };
}

/** How long a reply's attention lasts, and how hard it leans. A hash picks who listens. The price stream is not drawn. */
const ATTENTION_TICKS = 24;
const ATTENTION_BIAS = 0.35;

function armAttention(t: LpToken, tick: number, replyId: number): void {
  const traders = t.micro?.traders;
  if (!traders || traders.length === 0) return;
  for (const w of traders) {
    if ((tickerHash(`${t.ticker}:${tick}:${replyId}:${w.id}`) & 1) === 0) {
      w.attn = ATTENTION_BIAS;
      w.attnUntil = tick + ATTENTION_TICKS;
    }
  }
}

/**
 * The NPC replies of one token, called once a tick from the Launchpad's tick. The draw is a hash of the token and the tick, so it
 * depends on nothing else and is the same on every replay. A dead token has no replies. A live token replies only while a PLAYER (or the
 * creator) trades it: the NPC cohort's own fills do not count (review fix, Phase 10; the cohort bleeds every few ticks, so counting its
 * lines made the gate always true). A graduated token replies on the odds alone, from its own pool of lines (no curve talk).
 */
export function npcReplyTick(g: GameState, t: LpToken): void {
  if (t.status === 'dead') return;
  const tick = g.market.tick;
  if (tick % LP.CHART_EVERY !== 0) return;
  if (t.npcReplyAt !== undefined && tick - t.npcReplyAt < LP.NPC_REPLY_GAP_TICKS) return;
  if (t.status === 'live' && (t.playerTradeAt === undefined || tick - t.playerTradeAt > LP.NPC_REPLY_WINDOW_TICKS)) return;
  if (tickerHash(`${t.ticker}:r:${tick}`) / 2 ** 32 >= LP.NPC_REPLY_ODDS) return;
  const who = LP_NPC_HANDLES[tickerHash(`${t.ticker}:h:${tick}`) % LP_NPC_HANDLES.length]!;
  // the lines are chosen from the pool of the token's status, so a line never talks about a state the token is not in
  const pool = t.status === 'graduated' ? LP_NPC_REPLY_POOLS.graduated : LP_NPC_REPLY_POOLS.live;
  const n = pool[tickerHash(`${t.ticker}:k:${tick}`) % pool.length]!;
  pushReply(t, { tick, who, role: 'npc', key: `lp.npcreply.${n}`, vars: {} });
  t.npcReplyAt = tick;
}

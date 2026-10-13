import type { CommandResult, GameState, StepOutput } from '../types';
import { LP } from './constants';
import { anonOf } from './anon';
import { tickerHash } from './icon';
import { moderateText, type TextRefusal } from './moderate';
import { refuse, tokenOf } from './state';
import type { LpReply, LpToken } from './types';
import { LP_NPC_HANDLES, LP_NPC_REPLIES } from '../text/lpReplies';

/**
 * The replies thread of a token (R-10-6, Phase 10). A player posts up to 140 characters of plain text, moderated (no link, no abusive
 * word, not empty), at most one reply a real minute on a token. The creator's replies are marked as the creator's. NPC replies come
 * from the text layer's templates under fictional handles: deterministic (a hash of the token and the tick, not a stream draw, so a
 * replay is byte-identical and no other draw moves), and rate-limited (one every five real minutes at most, only while the token
 * still trades).
 */

const REFUSAL_CODE: Record<TextRefusal, string> = { empty: 'replyEmpty', long: 'replyLong', link: 'replyLink', abuse: 'replyAbuse' };

/** Pushes a reply and keeps the newest REPLY_KEEP. */
export function pushReply(t: LpToken, r: LpReply): void {
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
  return { ok: true, data: { tick, text: m.text } };
}

/**
 * The NPC replies of one token, called once a tick from the Launchpad's tick. The draw is a hash of the token and the tick, so it
 * depends on nothing else and is the same on every replay. A dead token has no replies; a live or graduated one may, after the gap.
 */
export function npcReplyTick(g: GameState, t: LpToken): void {
  if (t.status === 'dead') return;
  const tick = g.market.tick;
  if (tick % LP.CHART_EVERY !== 0) return;
  if (t.npcReplyAt !== undefined && tick - t.npcReplyAt < LP.NPC_REPLY_GAP_TICKS) return;
  // a live token replies while it still trades (its tape has a line in the window); a graduated token replies on the odds alone
  if (t.status === 'live') {
    const lastLine = t.tape[t.tape.length - 1];
    if (!lastLine || tick - lastLine.tick > LP.NPC_REPLY_WINDOW_TICKS) return;
  }
  if (tickerHash(`${t.ticker}:r:${tick}`) / 2 ** 32 >= LP.NPC_REPLY_ODDS) return;
  const who = LP_NPC_HANDLES[tickerHash(`${t.ticker}:h:${tick}`) % LP_NPC_HANDLES.length]!;
  const n = tickerHash(`${t.ticker}:k:${tick}`) % LP_NPC_REPLIES;
  pushReply(t, { tick, who, role: 'npc', key: `lp.npcreply.${n}`, vars: {} });
  t.npcReplyAt = tick;
}

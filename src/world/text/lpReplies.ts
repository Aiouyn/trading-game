import type { Msg } from '@/i18n';

/**
 * The Launchpad's NPC replies (R-10-6, Phase 10): the lines an NPC posts on a token's thread, and the fictional handles they post
 * under. The world stores the message key and a handle (never a real person's name), and the viewer's language renders the key, so
 * the lines live in en.json and fr.json as `lp.npcreply.<n>`. A handle is fictional and is never matched to a real account.
 */
export const LP_NPC_REPLIES = 20;

export const LP_NPC_HANDLES: readonly string[] = [
  'candle_nomad', 'pit_lantern', 'quiet_whale_9', 'lot_sizer', 'dustbowl_kai', 'late_ledger', 'gas_gus', 'paper_pia',
  'brine_mike', 'moonlet_jo', 'rookie_ray', 'tape_reader_7', 'slow_bleed', 'kettle_hands', 'fern_capital', 'iron_tulip',
  'cold_brew_cy', 'night_orderbook', 'sprocket_9', 'harbor_dan', 'plum_queue', 'blue_chip_bo', 'velvet_mole', 'owl_trades',
  'dune_runner', 'marigold_v', 'juniper_k', 'oak_street',
];

/** The message of an NPC reply: the template index and the handle index, both drawn deterministically by the world. */
export function npcReplyMsg(index: number): Msg {
  return { key: `lp.npcreply.${index}`, vars: {} };
}

/** The reply template keys, in order (the test checks each has its en and fr copy). */
export const LP_NPC_REPLY_KEYS: readonly string[] = Array.from({ length: LP_NPC_REPLIES }, (_, i) => `lp.npcreply.${i}`);

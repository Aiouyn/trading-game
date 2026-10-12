import type { NpcStyle } from '@/content/progression';
import type { Msg } from '@/i18n';

/**
 * The NPC rivals' chat lines (P8-4). The engine stores each line as the English text below, so saves and replays are
 * unchanged. A viewer's screen translates a stored NPC line back to its i18n key (npc.chat.<style>.<n>, en.json and
 * fr.json), matched on the English template with "{a}" as the stock the line names.
 */
export const CHATTER: Record<NpcStyle, string[]> = {
  momentum: ['Trend is your friend. Riding {a} today.', 'If it is going up, I want it.', '{a} breaking out. Who else is in?'],
  value: ['Everyone hates {a}. That is why I am buying.', 'Price is what you pay, value is what you get.', 'Patience pays. Mostly.'],
  dividend: ['Another coupon in the bank.', 'Dividends do not lie.', 'Boring is beautiful.'],
  crypto: ['{a} to the moon!!', 'Have fun staying poor.', 'Bought the dip. Then the other dip.'],
  tycoon: ['Just opened another shop. Never stop building.', 'Businesses pay while you sleep.', 'Who needs stocks when you own the street?'],
  whale: ['…', 'Interesting market.', 'We are accumulating.'],
  contrarian: ['Sold the rip. Easy.', 'Everyone is too bullish on {a}.', 'When they panic, I buy.'],
  macro: ['Watch the central bank. Nothing else matters.', 'Inflation print tomorrow. Positioned.', 'Long gold, short hope.'],
  landlord: ['Bought another flat. Rent is king.', 'Real estate never goes to zero.', 'Tenants are the best customers.'],
  gambler: ['All in on {a}.', 'Up 40% or down 40%, no in-between.', 'YOLO.'],
};

/** The i18n key of one NPC chat line (its index in CHATTER[style]). */
export function npcChatKey(style: NpcStyle, index: number): string {
  return `npc.chat.${style}.${index}`;
}

interface ChatLine {
  key: string;
  re: RegExp;
}

let table: ChatLine[] | null = null;

function lines(): ChatLine[] {
  if (table) return table;
  const out: ChatLine[] = [];
  for (const style of Object.keys(CHATTER) as NpcStyle[]) {
    CHATTER[style].forEach((line, i) => {
      const src = line
        .split('{a}')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('(.+)');
      out.push({ key: npcChatKey(style, i), re: new RegExp(`^${src}$`, 'u') });
    });
  }
  table = out;
  return out;
}

/** The message descriptor of a stored NPC chat line, or undefined when the text is not one of the engine's lines. */
export function npcChatMsg(text: string): Msg | undefined {
  for (const l of lines()) {
    const m = l.re.exec(text);
    if (!m) continue;
    return m[1] !== undefined ? { key: l.key, vars: { a: m[1] } } : { key: l.key };
  }
  return undefined;
}

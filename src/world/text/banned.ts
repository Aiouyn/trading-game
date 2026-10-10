/**
 * Words the world's player-facing text never uses. They turn a fact into advice or a promise (velvet-daily-close.md:33,
 * velvet-research-desk.md:52, velvet-trade-journal-replay.md:28, tape-acceptance.md:72). Matched as whole words, any case.
 */
export const BANNED_WORDS: readonly string[] = [
  'should', 'consider', 'buy', 'sell', 'opportunity', 'great day', 'will', 'expect', 'likely', 'next', 'target', 'signal',
  'undervalued', 'overvalued', 'mistake', 'lucky', 'smart', 'you should have',
];

/** The banned words found in a text (empty when clean). */
export function bannedIn(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_WORDS.filter((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/ /g, '\\s+')}($|[^\\p{L}])`, 'u').test(lower));
}

/**
 * Words the world's player-facing text never uses. They turn a fact into advice or a promise (velvet-daily-close.md:33,
 * velvet-research-desk.md:52, velvet-trade-journal-replay.md:28, tape-acceptance.md:72). Matched as whole words, any case.
 */
export const BANNED_WORDS: readonly string[] = [
  'should', 'consider', 'buy', 'sell', 'opportunity', 'great day', 'will', 'expect', 'likely', 'next', 'target', 'signal',
  'undervalued', 'overvalued', 'mistake', 'lucky', 'smart', 'you should have',
];

/**
 * The French equivalents of the same rule, for the French copy. Each entry is the forecast, advice or promise word (or its
 * closest everyday form). Side labels such as "acheter" are the order form's own words and are not listed.
 */
export const BANNED_WORDS_FR: readonly string[] = [
  'devrait', 'devriez', 'considérer', 'considérez', 'opportunité', 'probablement', 'sera', 'seront', 'prochain', 'prochaine',
  'signal', 'sous-évalué', 'sous-évaluée', 'surévalué', 'surévaluée', 'cours cible', 'objectif de cours', 'erreur', 'chanceux',
  'malin', 'belle journée', 'vous auriez dû', 'vous auriez du', 's’attend', "s'attend",
];

/** The banned words found in a text (empty when clean). The English list by default; pass BANNED_WORDS_FR for French. */
export function bannedIn(text: string, words: readonly string[] = BANNED_WORDS): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/ /g, '\\s+')}($|[^\\p{L}])`, 'u').test(lower));
}

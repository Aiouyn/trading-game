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

/**
 * buy and sell are not banned words: they are the order form's labels and the lesson steps' verbs. What is banned is the
 * advice built on them: a recommendation, a should, or a timing call. These patterns catch that advice in either language.
 */
export const ADVICE_PATTERNS_EN: readonly RegExp[] = [
  /\b(should|must|ought to|need to|better to|recommend\w*|advise\w*|suggest\w*)\s+(buy|sell|buying|selling)\b/i,
  /\b(buy|sell)\s+(now|today|tomorrow|the dip|on dips)\b/i,
  /\b(good|best|right|great) (time|moment|chance|idea) to (buy|sell)\b/i,
  /\bstrong (buy|sell)\b/i,
  /\b(you|we) (should|could|might|may) (have )?(buy|sell|hold)\b/i,
];

export const ADVICE_PATTERNS_FR: readonly RegExp[] = [
  /\b(devriez|devrait|faut|conseill\w*|recommand\w*|suggér\w*)\s+(acheter|vendre|garder|conserver)\b/i,
  /\b(acheter|vendre)\s+(maintenant|aujourd’hui|aujourd'hui|demain|sur la baisse)\b/i,
  /\b(bon|meilleur|moment idéal|bonne occasion) (moment|temps|idée|occasion) (pour|de) (acheter|vendre)\b/i,
];

/** The advice patterns found in a text (empty when clean). */
export function adviceIn(text: string, patterns: readonly RegExp[]): string[] {
  return patterns.filter((re) => re.test(text)).map((re) => re.source);
}

/** The banned words found in a text (empty when clean). The English list by default; pass BANNED_WORDS_FR for French. */
export function bannedIn(text: string, words: readonly string[] = BANNED_WORDS): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/ /g, '\\s+')}($|[^\\p{L}])`, 'u').test(lower));
}

// The Learn app's glossary data (Phase 2 step 3, C-38). Pure data: no React, no engine. Each glossary id has a
// learn.term.<id>.name and learn.term.<id>.def pair in en.json and fr.json. The lessons are in content/lessons.ts.

/** Every game term the screens use, in one list. Keep it in step with the terms in the UI. */
export const GLOSSARY_IDS = [
  'broker', 'ticket', 'ticker', 'market_order', 'limit_order', 'stop_order', 'stop_limit', 'trailing_stop',
  'position', 'cash', 'net_worth', 'unrealized_gain', 'fee', 'slippage', 'margin', 'short',
  'option', 'strike', 'expiry',
  'wire', 'rumor', 'priced_in', 'earnings', 'analyst', 'world_event', 'sector', 'volatility', 'day',
  'rank', 'prestige', 'business', 'contract', 'license', 'company', 'research_desk', 'workspace',
  'focus_mode', 'layout', 'shelf', 'launcher',
] as const;

export type TermId = (typeof GLOSSARY_IDS)[number];

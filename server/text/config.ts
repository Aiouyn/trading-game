/**
 * The model text slot's configuration (lead-phase7.md P7-2). Off unless TEXT_PROVIDER=claude and an API key is set, so with no
 * environment nothing changes. Every figure here is read once at boot; a test passes its own environment.
 */

/** USD per million tokens, per model (the price table is a config constant: update it here when Anthropic's prices move). */
export const TEXT_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

/** The price used for a model missing from the table: the most expensive row, so an unknown model can only over-count the cap. */
export function priceOf(model: string): { input: number; output: number } {
  const known = TEXT_PRICES_USD_PER_MTOK[model];
  if (known) return known;
  return Object.values(TEXT_PRICES_USD_PER_MTOK).reduce((a, b) => (b.output > a.output ? b : a));
}

/** The roles the model slot knows (lead-phase7.md P7-1). Only the ones named in TEXT_ROLES are ever enriched. */
export const TEXT_ROLE_IDS = ['newsroom', 'executives', 'rumor', 'rival', 'analyst', 'narrator', 'moderator'] as const;
export type TextRoleId = (typeof TEXT_ROLE_IDS)[number];

export interface TextConfig {
  /** true only when TEXT_PROVIDER=claude and ANTHROPIC_API_KEY is set */
  enabled: boolean;
  apiKey: string;
  model: string;
  /** the daily spend cap in USD (TEXT_DAILY_USD_CAP, default 1) */
  dailyUsdCap: number;
  /** the roles that may be enriched (TEXT_ROLES, comma separated; default newsroom) */
  roles: ReadonlySet<string>;
  /** calls per role per minute (TEXT_RATE_PER_MIN, default 6) */
  ratePerMinute: number;
  /** a call that does not answer in time falls back to the template (TEXT_TIMEOUT_MS, default 8000) */
  timeoutMs: number;
  /** the longest accepted line, in characters, per locale */
  maxChars: number;
  /** the output token cap per call */
  maxTokens: number;
}

export const DEFAULT_TEXT_MODEL = 'claude-haiku-5-5';

export function textConfigFromEnv(env: Record<string, string | undefined> = process.env): TextConfig {
  const provider = (env.TEXT_PROVIDER ?? '').trim().toLowerCase();
  const apiKey = (env.ANTHROPIC_API_KEY ?? '').trim();
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : d;
  };
  const roles = (env.TEXT_ROLES ?? 'newsroom').split(',').map((r) => r.trim()).filter((r) => (TEXT_ROLE_IDS as readonly string[]).includes(r));
  return {
    enabled: provider === 'claude' && apiKey.length > 0,
    apiKey,
    model: (env.TEXT_MODEL ?? '').trim() || DEFAULT_TEXT_MODEL,
    dailyUsdCap: num(env.TEXT_DAILY_USD_CAP, 1),
    roles: new Set(roles),
    ratePerMinute: num(env.TEXT_RATE_PER_MIN, 6),
    timeoutMs: num(env.TEXT_TIMEOUT_MS, 8000),
    maxChars: 200,
    maxTokens: 300,
  };
}

/** The USD cost of one call from its token usage, at the model's price. */
export function callCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

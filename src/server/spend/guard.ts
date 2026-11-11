// M3-06 spend guard. Pure env gate: no network, no SDK, no disk.
// Local file stores, the in-process quote clock, and the local telemetry jsonl are not paid providers.
// Opt-in lets the process accept a paid configuration. It does not provision or connect.

export type PaidProviderId = "hosting" | "database" | "analytics" | "log_sink" | "tick_host";

export type SpendEnv = Readonly<Record<string, string | undefined>>;

export type SpendDecision = {
  optIn: boolean;
  killSwitch: boolean;
  readOnly: boolean;
  tickAutostart: boolean;
  enabled: PaidProviderId[];
};

export class SpendGuardError extends Error {
  readonly code = "SPEND_GUARD";
  constructor(message: string) {
    super(message);
    this.name = "SpendGuardError";
  }
}

const OPT_IN = "QUAY_SPEND_OPT_IN";
const KILL = "QUAY_KILL_SWITCH";

/** Env vars that ask this process to use a paid provider. Presence is enough; values are never logged. */
export const PAID_PROVIDER_VARS: readonly { id: PaidProviderId; vars: readonly string[] }[] = [
  { id: "hosting", vars: ["VERCEL"] },
  {
    id: "database",
    vars: [
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
    ],
  },
  {
    id: "analytics",
    vars: ["QUAY_ANALYTICS_SINK", "SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN", "NEXT_PUBLIC_POSTHOG_KEY", "POSTHOG_KEY"],
  },
  { id: "log_sink", vars: ["QUAY_LOG_SINK", "LOGTAIL_SOURCE_TOKEN", "AXIOM_TOKEN", "DATADOG_API_KEY"] },
  { id: "tick_host", vars: ["QUAY_TICK_HOST"] },
];

const URL_VARS = new Set([
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "QUAY_TICK_HOST",
]);

const URL_PROTOCOLS = new Set(["https:", "postgres:", "postgresql:"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function present(env: SpendEnv, key: string): string | null {
  const raw = env[key];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

function assertFlag(env: SpendEnv, name: string): boolean {
  const value = present(env, name);
  if (value === null) return false;
  if (value !== "1") {
    throw new SpendGuardError(`Spend guard: ${name} must be unset or exactly "1". Refusing to start.`);
  }
  return true;
}

function assertProviderValue(name: string, value: string): void {
  if (/\s/.test(value)) {
    throw new SpendGuardError(`Spend guard: ${name} must be a single token. Refusing to start.`);
  }
  const urlShaped = URL_VARS.has(name) || value.includes("://");
  if (!urlShaped) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SpendGuardError(`Spend guard: ${name} must be an https or postgres URL. Refusing to start.`);
  }
  if (!URL_PROTOCOLS.has(url.protocol)) {
    throw new SpendGuardError(`Spend guard: ${name} must use https, postgres, or postgresql. Refusing to start.`);
  }
}

type Hit = { id: PaidProviderId; name: string; value: string };

function requested(env: SpendEnv): Hit[] {
  const hits: Hit[] = [];
  for (const row of PAID_PROVIDER_VARS) {
    for (const name of row.vars) {
      const value = present(env, name);
      if (value !== null) hits.push({ id: row.id, name, value });
    }
  }
  return hits;
}

export function killSwitchOn(env: SpendEnv): boolean {
  return assertFlag(env, KILL);
}

/** In-process quote clock. Tests never autostart. The kill switch pauses every other environment. */
export function clockAutostartAllowed(env: SpendEnv): boolean {
  return env.NODE_ENV !== "test" && !killSwitchOn(env);
}

/**
 * Accept the env, or throw. A paid provider without QUAY_SPEND_OPT_IN=1 refuses the start.
 * Opt-in records the provider as enabled and still does not open a connection.
 */
export function resolveSpendGuard(env: SpendEnv): SpendDecision {
  const optIn = assertFlag(env, OPT_IN);
  const killSwitch = killSwitchOn(env);
  const hits = requested(env);
  if (!optIn && hits.length > 0) {
    const list = hits.map((h) => `${h.id} (${h.name})`).join(", ");
    throw new SpendGuardError(
      `Spend guard: refusing to start with paid provider(s) ${list} until QUAY_SPEND_OPT_IN=1. No host, database, analytics sink, log sink, or tick host was enabled.`,
    );
  }
  if (optIn) {
    for (const hit of hits) assertProviderValue(hit.name, hit.value);
  }
  const enabled: PaidProviderId[] = [];
  for (const hit of hits) {
    if (!enabled.includes(hit.id)) enabled.push(hit.id);
  }
  return {
    optIn,
    killSwitch,
    readOnly: killSwitch,
    tickAutostart: env.NODE_ENV !== "test" && !killSwitch,
    enabled,
  };
}

export function assertBootEnv(env: SpendEnv): SpendDecision {
  return resolveSpendGuard(env);
}

/** Refuse to turn a paid provider on unless the owner opted in and that provider is configured. */
export function assertPaidProviderEnabled(env: SpendEnv, id: PaidProviderId): void {
  const decision = resolveSpendGuard(env);
  if (!decision.optIn) {
    throw new SpendGuardError(
      `Spend guard: refusing to enable ${id} without QUAY_SPEND_OPT_IN=1. Nothing was provisioned.`,
    );
  }
  if (!decision.enabled.includes(id)) {
    throw new SpendGuardError(`Spend guard: ${id} is not configured, so it stays off.`);
  }
}

export function readOnlyBlock(env: SpendEnv, method: string): { status: 503; message: string } | null {
  if (!killSwitchOn(env)) return null;
  if (SAFE_METHODS.has(method.toUpperCase())) return null;
  return {
    status: 503,
    message: "Spend guard kill switch is on. Ticks are paused and mutations are refused.",
  };
}

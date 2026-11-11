const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ACC_ID = /\bacc_[a-z0-9]+\b/gi;
const AUTH_LINE = /Authorization:\s*[^\n]*/gi;
const BEARER = /Bearer\s+\S+/gi;
const COOKIE_LINE = /(?:Cookie|Set-Cookie):\s*[^\n]*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export const TELEMETRY_MESSAGE_CAP = 2000;

/** Strip secrets, emails, and account ids. Cap length. */
export function scrubTelemetryText(input: string, cap = TELEMETRY_MESSAGE_CAP): string {
  let t = input.normalize("NFKC");
  t = t.replace(AUTH_LINE, "Authorization: [redacted]");
  t = t.replace(BEARER, "Bearer [redacted]");
  t = t.replace(COOKIE_LINE, "[redacted]");
  t = t.replace(JWT, "[redacted]");
  t = t.replace(EMAIL, "[redacted]");
  t = t.replace(ACC_ID, "[redacted]");
  if (t.length > cap) t = t.slice(0, cap);
  return t;
}

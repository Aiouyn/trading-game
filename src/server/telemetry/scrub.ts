/** Detection fold, same family as statements `foldForPersonalData`. */
const FORMAT_CHARS = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const CONTROLS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ACC_ID = /\bacc_[a-z0-9]+\b/gi;
const AUTH_LINE = /Authorization:\s*[^\n]*/gi;
const BEARER = /Bearer\s+\S+/gi;
const COOKIE_LINE = /(?:Cookie|Set-Cookie):\s*[^\n]*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
// Not preceded by '/' so Chrome/122.0.0.0 (and other product/version tokens) stay.
const IPV4 = /(?<![\w/])(?:\d{1,3}\.){3}\d{1,3}\b/g;
// IPv6, including compressed forms and ::1. Applied after lowercasing is not required; hex is case-insensitive.
// Tokens with at least two colons and only hex — clocks like "11:20" have one colon and stay.
const IPV6 = /(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
/** 8-4-4-4-12 hex. Request ids are UUIDs; a digit run inside one is not a phone. */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Home prefixes in stacks: /home/<user>, /Users/<name>, C:\Users\<Name> (or forward slashes).
const HOME_POSIX = /(?:\/home|\/Users)\/[^/\s:]+/g;
const HOME_WIN = /[A-Za-z]:[\\/]Users[\\/][^\\/\s:]+/g;
/** http(s), protocol-relative, or a path, optionally with a query and/or fragment. */
const URLISH = /((?:https?:\/\/|\/\/)[^\s?#]+|\/[^\s?#]*)(\?[^\s#]*)?(#[^\s]*)?/gi;

export const TELEMETRY_MESSAGE_CAP = 2000;

export function foldTelemetryText(text: string): string {
  let s = text.normalize("NFKC").replace(FORMAT_CHARS, "").replace(CONTROLS, "");
  s = s.replace(/[\[\(\{]\s*at\s*[\]\)\}]/gi, "@");
  // Only fold "at" in email-like context (local at domain.tld), not "rise at 11:20".
  s = s.replace(/([A-Z0-9._%+-]+)\s+at\s+([A-Z0-9-]+\.[A-Z]{2,})/gi, "$1@$2");
  s = s.replace(/\s*@\s*/g, "@");
  return s;
}

/** Pure decimals (123456.78) and 4-octet versions (122.0.0.0) are not phone numbers.
 *  Dotted FR phones have more than three dots (06.12.34.56.78). */
function looksLikeDecimalOrVersion(s: string): boolean {
  return /^\d+\.\d+$/.test(s) || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(s);
}

/** Redact phones. A match that sits entirely inside a UUID is left alone. */
function redactPhones(input: string): string {
  UUID_RE.lastIndex = 0;
  const spans: Array<[number, number]> = [];
  for (const match of input.matchAll(UUID_RE)) {
    const at = match.index ?? 0;
    spans.push([at, at + match[0].length]);
  }
  PHONE.lastIndex = 0;
  return input.replace(PHONE, (phone: string, offset: number) => {
    if (looksLikeDecimalOrVersion(phone)) return phone;
    const end = offset + phone.length;
    if (spans.some(([start, stop]) => offset >= start && end <= stop)) return phone;
    return "[redacted]";
  });
}

function stripUrlQueryAndFragment(input: string): string {
  return input.replace(URLISH, (all, base: string, query?: string, hash?: string) => {
    if (query || hash) return base;
    return all;
  });
}

/** Strip secrets, emails, phones, IPs, and URL query/fragments. Cap length. */
export function scrubTelemetryText(input: string, cap = TELEMETRY_MESSAGE_CAP): string {
  let t = foldTelemetryText(input);
  t = stripUrlQueryAndFragment(t);
  t = t.replace(AUTH_LINE, "Authorization: [redacted]");
  t = t.replace(BEARER, "Bearer [redacted]");
  t = t.replace(COOKIE_LINE, "[redacted]");
  t = t.replace(JWT, "[redacted]");
  t = t.replace(HOME_POSIX, "[redacted]");
  t = t.replace(HOME_WIN, "[redacted]");
  t = t.replace(EMAIL, "[redacted]");
  // acc_ before phone: a long hex id contains digit runs the phone regex would otherwise eat.
  t = t.replace(ACC_ID, "[redacted]");
  t = redactPhones(t);
  t = t.replace(IPV6, "[redacted]");
  t = t.replace(IPV4, "[redacted]");
  if (t.length > cap) t = t.slice(0, cap);
  return t;
}

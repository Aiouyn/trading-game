/** Detection fold, same family as statements `foldForPersonalData`. */
const FORMAT_CHARS = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const CONTROLS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ACC_ID = /\bacc_[a-z0-9]+\b/gi;
const AUTH_LINE = /Authorization:\s*[^\n]*/gi;
const BEARER = /Bearer\s+\S+/gi;
const COOKIE_LINE = /(?:Cookie|Set-Cookie):\s*[^\n]*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// IPv6, including compressed forms and ::1. Applied after lowercasing is not required; hex is case-insensitive.
// Tokens with at least two colons and only hex — clocks like "11:20" have one colon and stay.
const IPV6 = /(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
/** http(s), protocol-relative, or a path, optionally with a query and/or fragment. */
const URLISH = /((?:https?:\/\/|\/\/)[^\s?#]+|\/[^\s?#]*)(\?[^\s#]*)?(#[^\s]*)?/gi;

export const TELEMETRY_MESSAGE_CAP = 2000;

export function foldTelemetryText(text: string): string {
  let s = text.normalize("NFKC").replace(FORMAT_CHARS, "").replace(CONTROLS, "");
  s = s.replace(/[\[\(\{]\s*at\s*[\]\)\}]/gi, "@");
  s = s.replace(/\s+at\s+/gi, "@");
  s = s.replace(/\s*@\s*/g, "@");
  return s;
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
  t = t.replace(EMAIL, "[redacted]");
  t = t.replace(PHONE, "[redacted]");
  t = t.replace(IPV6, "[redacted]");
  t = t.replace(IPV4, "[redacted]");
  t = t.replace(ACC_ID, "[redacted]");
  if (t.length > cap) t = t.slice(0, cap);
  return t;
}

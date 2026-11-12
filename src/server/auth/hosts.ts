/** Host strings for the CSRF allowlist. No I/O. */

export function hostLabel(host: string): string {
  let value = host.trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value : value.slice(1, end);
  }
  const colon = value.lastIndexOf(":");
  if (colon > 0 && value.indexOf(":") === colon && /^\d+$/.test(value.slice(colon + 1))) {
    value = value.slice(0, colon);
  }
  return value;
}

export function hostPort(host: string): string {
  const value = host.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end === -1) return "";
    const rest = value.slice(end + 1);
    return rest.startsWith(":") ? rest.slice(1) : "";
  }
  const lower = value.toLowerCase();
  const colon = lower.lastIndexOf(":");
  if (colon > 0 && lower.indexOf(":") === colon && /^\d+$/.test(lower.slice(colon + 1))) {
    return lower.slice(colon + 1);
  }
  return "";
}

export function formatHost(name: string, port: string): string {
  const label = name.toLowerCase();
  const body = label.includes(":") ? `[${label}]` : label;
  return port ? `${body}:${port}` : body;
}

export function normalizeHost(host: string): string {
  return formatHost(hostLabel(host), hostPort(host));
}

/** 127.0.0.0/8, localhost, and ::1. Wildcard binds (0.0.0.0, ::) are not loopback. */
export function isLoopbackHost(host: string): boolean {
  const name = hostLabel(host);
  if (name === "localhost" || name === "::1") return true;
  if (name.startsWith("::ffff:")) return isLoopbackHost(name.slice("::ffff:".length));
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name);
  if (!v4) return false;
  const nums = [v4[1], v4[2], v4[3], v4[4]].map(Number);
  if (nums.some((n) => n > 255)) return false;
  return nums[0] === 127;
}

function isUnspecified(name: string): boolean {
  return name === "0.0.0.0" || name === "::" || name === "*";
}

const LOOPBACK_NAMES = ["localhost", "127.0.0.1", "::1"] as const;

/** Browser names for one loopback (or wildcard) stamp, on that same port. */
export function loopbackAliases(host: string): readonly string[] {
  const name = hostLabel(host);
  if (!isLoopbackHost(host) && !isUnspecified(name)) return [];
  const port = hostPort(host);
  return LOOPBACK_NAMES.map((entry) => formatHost(entry, port));
}

export function trustedHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed) out.push(normalizeHost(trimmed));
  }
  return out;
}

/** First X-Forwarded-Host value, normalized. The caller decides whether to believe it. */
export function forwardedHost(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  if (!first) return null;
  return normalizeHost(first);
}

import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { isLoopbackHost } from "./hosts";

export const EXPOSED_HOST_MESSAGE =
  'Refusing to start: this process binds or serves a non-loopback host, and QUAY_TRUST_PROXY is not exactly "1". Route handlers cannot see the peer address, so per-IP limits need the proxy\'s X-Forwarded-For. Use 127.0.0.1, localhost, or ::1, or set QUAY_TRUST_PROXY=1 behind a reverse proxy.';

export class ExposedBindError extends Error {
  readonly code = "EXPOSED_BIND";
  constructor() {
    super(EXPOSED_HOST_MESSAGE);
    this.name = "ExposedBindError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export function isExposedHost(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) return false;
  return !isLoopbackHost(trimmed);
}

/**
 * A non-loopback bind or serve host refuses to start unless QUAY_TRUST_PROXY is exactly "1".
 * Not trimmed: " 1", "1 ", and "true" do not count. Loopback hosts do not need the flag.
 */
export function assertTrustProxyForExposedHost(env: Env, hosts: readonly string[]): void {
  if (!hosts.some(isExposedHost)) return;
  if (env.QUAY_TRUST_PROXY === "1") return;
  throw new ExposedBindError();
}

export function hostnameFromArgv(argv: readonly string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "-H" || arg === "--hostname") {
      const next = argv[i + 1];
      return next && !next.startsWith("-") ? next : null;
    }
    if (arg.startsWith("--hostname=")) {
      const value = arg.slice("--hostname=".length);
      return value || null;
    }
  }
  return null;
}

/** Decode a /proc/net/tcp[6] local_address (hex IP, optional :port). */
export function decodeProcAddress(local: string, ipv6: boolean): string {
  const hex = (local.split(":")[0] ?? "").toLowerCase();
  if (!ipv6) return bytePairs(hex).reverse().join(".");
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 8) bytes.push(...bytePairs(hex.slice(i, i + 8)).reverse());
  return formatIpv6(bytes);
}

function bytePairs(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function formatIpv6(bytes: number[]): string {
  if (bytes.length !== 16 || bytes.some((b) => Number.isNaN(b))) return "";
  if (bytes.every((b) => b === 0)) return "::";
  if (bytes[15] === 1 && bytes.slice(0, 15).every((b) => b === 0)) return "::1";
  const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255;
  if (mapped) return `::ffff:${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return groups.join(":");
}

/** LISTEN sockets owned by this process. Empty when /proc cannot be read. */
export function listeningHosts(): string[] {
  let inodes: Set<string>;
  try {
    inodes = socketInodes();
  } catch {
    return [];
  }
  if (inodes.size === 0) return [];
  const hosts: string[] = [];
  for (const [file, ipv6] of [
    ["/proc/net/tcp", false],
    ["/proc/net/tcp6", true],
  ] as const) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.trim().split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields[3] !== "0A") continue;
      if (!inodes.has(fields[9] ?? "")) continue;
      const host = decodeProcAddress(fields[1] ?? "", ipv6);
      if (host) hosts.push(host);
    }
  }
  return hosts;
}

function socketInodes(): Set<string> {
  const inodes = new Set<string>();
  for (const fd of readdirSync("/proc/self/fd")) {
    try {
      const target = readlinkSync(`/proc/self/fd/${fd}`);
      const match = /^socket:\[(\d+)\]$/.exec(target);
      if (match?.[1]) inodes.add(match[1]);
    } catch {
      /* fd closed between readdir and readlink */
    }
  }
  return inodes;
}

/** Bind address from argv, the public host, and this process's listen sockets. */
export function exposedHosts(env: Env, argv: readonly string[] = process.argv): string[] {
  const hosts: string[] = [];
  const fromArg = hostnameFromArgv(argv);
  if (fromArg) hosts.push(fromArg);
  const pinned = env.QUAY_PUBLIC_HOST?.trim();
  if (pinned) hosts.push(pinned);
  hosts.push(...listeningHosts());
  return hosts;
}

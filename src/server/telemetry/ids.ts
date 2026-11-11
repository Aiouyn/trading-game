import { createHash, randomUUID } from "node:crypto";

export const ANON_ID_RE = /^anon_[a-f0-9]{16,64}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

export function anonIdForAccount(accountId: string): string {
  const hex = createHash("sha256").update(`telemetry-anon:${accountId}`).digest("hex").slice(0, 16);
  return `anon_${hex}`;
}

export function requestIdFrom(request: Request): string {
  const raw = request.headers.get("x-request-id")?.trim() ?? "";
  if (REQUEST_ID_RE.test(raw)) return raw;
  return randomUUID();
}

export function isAnonId(value: unknown): value is string {
  return typeof value === "string" && ANON_ID_RE.test(value);
}

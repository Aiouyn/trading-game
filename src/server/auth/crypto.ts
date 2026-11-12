import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/** scrypt params: N=16384, r=8, p=1, keylen=64 — Node defaults with explicit key length. */
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return { hash: derived.toString("hex"), salt: salt.toString("hex") };
}

export async function verifyPassword(password: string, hashHex: string, saltHex: string): Promise<boolean> {
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function mintSessionToken(): { rawToken: string; tokenHash: string } {
  const raw = randomBytes(TOKEN_BYTES);
  return { rawToken: raw.toString("base64url"), tokenHash: hashToken(raw.toString("base64url")) };
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function newId(kind: "acc" | "ses" | "o" | "x" | "i"): string {
  return `${kind}_${randomBytes(16).toString("hex")}`;
}

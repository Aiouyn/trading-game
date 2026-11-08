// M2-05 offline `me` snapshot: the account lifecycle and storage of the one sanitised record (the record's codec,
// strict reader and allowlisted writer, is src/pwa/meSnapshotCodec.ts). doc 19 Rule 3.17.5, docs/v1/PWA.md.
// - Only the session's current account (set here by src/shell/authSession.ts) may write, from a server ledger its own
//   signed-in feed adopted; a late ledger from a previous account is refused when it runs.
// - Sign-out / a definite signed-out answer deletes the record at once (sync); another account's sign-in deletes it.
// - The codec is loaded lazily, and only once someone is signed in; every codec step runs in one ordered queue, so a
//   step registered after a sign-out or account switch always sees that change.
import type { BrokerLedgerView } from "@/market/brokerLedger";

export const ME_SNAPSHOT_KEY = "quay.offline.me.v1";
const ACCT = /^acc_[0-9a-f]{32}$/;

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
function remove(): void {
  try { storage()?.removeItem(ME_SNAPSHOT_KEY); } catch { /* storage unavailable: nothing was kept */ }
}

/** The account the session currently belongs to (authSession sets it). Only its ledgers may be written. */
let current: string | null = null;

type Codec = typeof import("./meSnapshotCodec");
let codec: Promise<Codec> | null = null;
let queue: Promise<unknown> = Promise.resolve();
/** Run fn with the codec, after every earlier queued step. A failed chunk load keeps nothing new. */
function withCodec<T>(fn: (c: Codec) => T, fallback: T): Promise<T> {
  const next = queue.then(() => (codec ??= import("./meSnapshotCodec"))).then(fn, () => fallback);
  queue = next;
  return next;
}

/** Signed in as `acct`: writes allowed for it; a record of any other account (or an unreadable one) is deleted. */
export function snapshotSignedIn(acct: string): Promise<void> {
  current = ACCT.test(acct) ? acct : null;
  return withCodec((c) => {
    let text: string | null = null;
    try { text = storage()?.getItem(ME_SNAPSHOT_KEY) ?? null; } catch { text = null; }
    if (text === null) return;
    const snap = c.parseMeSnapshot(text);
    if (!snap || snap.acct !== current) remove();
  }, undefined);
}
/** Signed out (sign-out, or the server says there is no session): no writes, record deleted. */
export function snapshotSignedOut(): void { current = null; remove(); }
/** Session state unknown (network error): stop writing, keep the record for the offline page. */
export function snapshotUnknown(): void { current = null; }

/** Save the latest own ledger for `acct`; refused unless `acct` is the current account when it runs. Resolves to whether it was kept. */
export function saveMeSnapshot(acct: string, v: BrokerLedgerView, now: number = Date.now()): Promise<boolean> {
  if (current === null || acct !== current) return Promise.resolve(false);
  return withCodec((c) => {
    if (current === null || acct !== current) return false; // signed out / switched while queued
    const snap = c.toMeSnapshot(acct, v, now);
    const s = storage();
    if (!snap || !s) { remove(); return false; } // a ledger we cannot represent never leaves an older one looking current
    try { s.setItem(ME_SNAPSHOT_KEY, JSON.stringify(snap)); return true; } catch { remove(); return false; }
  }, false);
}

export const _snapshotForTests = { reset() { current = null; }, current: () => current, idle: () => queue };

// M2-05 offline `me` snapshot: the account lifecycle and storage of the one sanitised record (the record's codec,
// strict reader and allowlisted writer, is src/pwa/meSnapshotCodec.ts). doc 19 Rule 3.17.5, docs/v1/PWA.md.
// - Only the session's current account (set here by src/shell/authSession.ts) may write, from a server ledger its own
//   signed-in feed adopted; a late ledger from a previous account is refused when it runs.
// - Sign-out / a definite signed-out answer deletes the record at once (sync). A sign-in deletes, also at once and
//   without the codec, any record that is not provably the signed-in account's.
// - The codec is loaded lazily, and only once someone is signed in; every codec step runs in one ordered queue, so a
//   step registered after a sign-out or account switch always sees that change. A failed chunk load is retried by
//   the next step and never leaves another account's record or an outdated own one behind.
import type { BrokerLedgerView } from "@/market/brokerLedger";

export const ME_SNAPSHOT_KEY = "quay.offline.me.v1";
const ACCT = /^acc_[0-9a-f]{32}$/;

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
/** Delete the record. If removeItem throws, blank it instead (an empty value reads as "no snapshot" in the app and on
 *  the offline page); if storage refuses both, there is nothing more the page can do. */
function remove(): void {
  const s = storage();
  if (!s) return;
  try { s.removeItem(ME_SNAPSHOT_KEY); } catch { try { s.setItem(ME_SNAPSHOT_KEY, ""); } catch { /* storage refuses writes */ } }
}

/** Synchronous, codec-free ownership check. The writer (meSnapshotCodec.toMeSnapshot + JSON.stringify) always starts
 *  the record with {"v":1,"acct":"<id>", and "acct" appears exactly once (no other field can contain it). Anything
 *  else is not provably this account's record. */
const ownedBy = (text: string, acct: string) => text.startsWith(`{"v":1,"acct":"${acct}",`) && text.split('"acct"').length === 2;

/** The account the session currently belongs to (authSession sets it). Only its ledgers may be written. */
let current: string | null = null;

type Codec = typeof import("./meSnapshotCodec");
let codec: Promise<Codec> | null = null;
/** A rejected chunk load is not kept: the next step imports again. */
const loadCodec = () => (codec ??= import("./meSnapshotCodec").catch((e: unknown) => { codec = null; throw e; }));
let queue: Promise<unknown> = Promise.resolve();
/** Run fn with the codec, after every earlier queued step; if the chunk fails to load, run onFail instead. */
function withCodec<T>(fn: (c: Codec) => T, onFail: () => T): Promise<T> {
  const next = queue.then(loadCodec).then(fn, onFail);
  queue = next.catch(() => undefined);
  return next;
}

/** Signed in as `acct`: writes allowed for it; a record of any other account (or an unreadable one) is deleted. */
/** Signed in as `acct`: writes allowed for it. A record that is not provably this account's is deleted at once,
 *  without the codec; the codec's full check of a kept record follows in the queue. */
export function snapshotSignedIn(acct: string): Promise<void> {
  current = ACCT.test(acct) ? acct : null;
  const read = (): string | null => { try { return storage()?.getItem(ME_SNAPSHOT_KEY) ?? null; } catch { return null; } };
  const text = read();
  if (text !== null && (current === null || !ownedBy(text, current))) remove();
  return withCodec((c) => {
    const kept = read();
    if (kept === null) return;
    const snap = c.parseMeSnapshot(kept);
    if (!snap || snap.acct !== current) remove();
  }, () => undefined); // chunk failed: what is left is provably this account's own record (checked above)
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
  }, () => {
    if (acct === current) remove(); // chunk failed: the newer ledger is not kept, so no older one stays looking current
    return false;
  });
}

export const _snapshotForTests = { reset() { current = null; }, current: () => current, idle: () => queue };

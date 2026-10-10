import type { CompanyWorld } from './types';

/**
 * The owner set (spec 6.1): a player and the accounts linked to it (alts, alliance mates) form one group. A related-party
 * deal is one inside a group; a takeover by a member of the group is self-dealing. Linking is a world fact, set by the
 * owner-set rules of the social layer (a link is never made by a company action). A player founds one company, so two
 * companies in one group is the only way related trade can happen (N1).
 */

/** The group id of a player: the player itself unless it is linked to another account. */
export function ownerGroup(w: CompanyWorld, pid: string): string {
  return w.linked?.[pid] ?? pid;
}

/** Every player id in the owner set of `pid`, the player included, sorted. */
export function ownerSetOf(w: CompanyWorld, pid: string): string[] {
  const g = ownerGroup(w, pid);
  const out = new Set<string>([pid, g]);
  for (const [account, grp] of Object.entries(w.linked ?? {})) if (grp === g) out.add(account);
  return [...out].sort();
}

/** Puts `pid` in the owner set of `ownerPid` (a link is one-way: `pid` takes the group of `ownerPid`). */
export function linkOwner(w: CompanyWorld, pid: string, ownerPid: string): void {
  if (pid === ownerPid) return;
  w.linked ??= {};
  w.linked[pid] = ownerGroup(w, ownerPid);
}

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

/**
 * V1 owner links come from the alliances only (lead ruling): the members of one alliance form one group, its id the first
 * member in sorted order. The map is rebuilt from the players' alliances, so a member who leaves an alliance leaves the
 * group. A collusion graph for alt accounts is not in V1 (the anti-cheat work, Phases 6 and 9).
 */
export function syncAllianceLinks(w: CompanyWorld, allianceOf: Record<string, string | null | undefined>): void {
  const first = new Map<string, string>();
  const linked: Record<string, string> = {};
  for (const pid of Object.keys(allianceOf).sort()) {
    const a = allianceOf[pid];
    if (!a) continue;
    const grp = first.get(a) ?? pid;
    first.set(a, grp);
    linked[pid] = grp;
  }
  w.linked = linked;
}

/** Puts `pid` in the owner set of `ownerPid` (a link is one-way: `pid` takes the group of `ownerPid`). */
export function linkOwner(w: CompanyWorld, pid: string, ownerPid: string): void {
  if (pid === ownerPid) return;
  w.linked ??= {};
  w.linked[pid] = ownerGroup(w, ownerPid);
}

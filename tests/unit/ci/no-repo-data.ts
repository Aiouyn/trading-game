import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** Repo checkout store. Unit tests must not persist here; e2e expects it fresh. */
export function repoDataDir(root: string): string {
  return path.join(root, ".data");
}

/**
 * Fails when `npm test` leaves `.data/` in the checkout.
 * The message names the top-level entries (auth, market, telemetry) so the writer is identifiable.
 */
export function assertNoRepoData(root: string): void {
  const dir = repoDataDir(root);
  if (!existsSync(dir)) return;
  let listing = "(unreadable)";
  try {
    listing = readdirSync(dir).sort().join(", ") || "(empty)";
  } catch {
    listing = "(unreadable)";
  }
  throw new Error(
    `npm test left ${dir} behind (${listing}). Unit tests that persist must use os.tmpdir via mkdtemp, not the repo .data directory.`,
  );
}

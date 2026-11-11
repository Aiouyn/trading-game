/**
 * Claim the store lock when a Next.js server instance starts.
 * `next build` does not call `register` (NEXT_PHASE is phase-production-build).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { resolveStoreRoots } = await import("@/server/ops/dataBackup");
  const { holdServerLock } = await import("@/server/ops/serverLock");
  for (const root of resolveStoreRoots(process.env, process.cwd())) {
    await holdServerLock(root.dir);
  }
}

import { assertBootEnv } from "@/server/spend/guard";

/**
 * Fail closed before serving, then claim the store lock when a Next.js server
 * instance starts. The Node build exits the process on a bad env. The edge
 * build cannot, and only rethrows; `next start` is the Node server.
 * `next build` does not call `register` (NEXT_PHASE is phase-production-build).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    assertBootEnv(process.env);
    return;
  }
  const { failClosed } = await import("./instrumentation-node");
  failClosed();
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { resolveStoreRoots } = await import("@/server/ops/dataBackup");
  const { holdServerLock } = await import("@/server/ops/serverLock");
  for (const root of resolveStoreRoots(process.env, process.cwd())) {
    await holdServerLock(root.dir);
  }
}

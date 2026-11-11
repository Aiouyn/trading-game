import { assertBootEnv } from "@/server/spend/guard";

/**
 * Fail closed before serving. The Node build exits the process. The edge build
 * cannot, and only rethrows; `next start` is the Node server.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    assertBootEnv(process.env);
    return;
  }
  const { failClosed } = await import("./instrumentation-node");
  failClosed();
}

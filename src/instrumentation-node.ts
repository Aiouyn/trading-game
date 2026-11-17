import { assertTrustProxyForExposedHost, exposedHosts } from "@/server/auth/bind";
import { assertBootEnv } from "@/server/spend/guard";

/** Node-only. Next catches a throw from `register` and keeps serving 500s, so exit instead. */
export async function startSimulation(): Promise<void> {
  try {
    const { ensureSim } = await import("./server/sim/host");
    await ensureSim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The simulation did not start.";
    console.error(message);
    process.exit(1);
  }
}

export function failClosed(): void {
  try {
    assertBootEnv(process.env);
    assertTrustProxyForExposedHost(process.env, exposedHosts(process.env));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refusing to start.";
    console.error(message);
    process.exit(1);
  }
}

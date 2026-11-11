import { assertBootEnv } from "@/server/spend/guard";

/** Fail the server before it listens when a paid provider is configured without the owner's opt-in. */
export function register(): void {
  assertBootEnv(process.env);
}

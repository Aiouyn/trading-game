import { assertBootEnv } from "@/server/spend/guard";

/** Node-only. Next catches a throw from `register` and keeps serving 500s, so exit instead. */
export function failClosed(): void {
  try {
    assertBootEnv(process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spend guard refused to start.";
    console.error(message);
    process.exit(1);
  }
}

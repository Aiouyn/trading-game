import { AuthError } from "./types";

/**
 * M1-01 file-backed sessions are local single-process only.
 * Refuse known multi-instance / hosted deploy shapes until a real shared store lands (M3).
 */
export function assertLocalSingleProcessAuth(): void {
  if (process.env.VERCEL) {
    throw new AuthError(
      "UNSUPPORTED_DEPLOY",
      "M1-01 auth uses a local single-process file store and is not deployable on Vercel yet.",
      503,
    );
  }
  if (process.env.QUAY_AUTH_MULTI_PROCESS === "1") {
    throw new AuthError(
      "UNSUPPORTED_DEPLOY",
      "Multi-process auth store is unsupported for M1-01. Run a single `next start` / `next dev` process.",
      503,
    );
  }
}

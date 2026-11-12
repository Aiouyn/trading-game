// Scripted check: `tsx tools/ops/boot-register.ts` runs the same hook as `next start`.
// A paid provider without an exact QUAY_SPEND_OPT_IN=1 exits 1. A clean env exits 0.
import { register } from "../../src/instrumentation";

void register().then(
  () => { process.exit(0); },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Spend guard refused to start.");
    process.exit(1);
  },
);

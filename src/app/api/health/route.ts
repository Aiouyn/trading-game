import { SpendGuardError, resolveSpendGuard } from "@/server/spend/guard";

export const dynamic = "force-dynamic";

/** Process liveness. Does not start the quote clock and does not touch a paid provider. */
export function GET(): Response {
  try {
    const spend = resolveSpendGuard(process.env);
    return Response.json({
      ok: true,
      killSwitch: spend.killSwitch,
      readOnly: spend.readOnly,
      spendOptIn: spend.optIn,
      paidProviders: spend.enabled,
      tickAutostart: spend.tickAutostart,
    });
  } catch (error) {
    const message = error instanceof SpendGuardError ? error.message : "Spend guard refused to start.";
    return Response.json({ ok: false, error: "SPEND_GUARD", message }, { status: 503 });
  }
}

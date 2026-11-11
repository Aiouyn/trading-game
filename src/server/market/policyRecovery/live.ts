import { ASSET_BY_ID } from "@/market/catalog";
import { parseMinor } from "@/market/quoteSnapshot";
import type { AuthService } from "@/server/auth/service";
import type { LiveMarket } from "../clock";
import { missing, missingInputs, observed, parseInputs, type CatalogInputs } from "./inputs";
import { hourOfTick } from "./time";

/** Read-only snapshot inside the existing Launchpad lock; no accounts, holdings, claims or cash writes. */
export function captureLiveCatalog(market: LiveMarket, auth: AuthService): Promise<CatalogInputs> {
  return auth.readLaunchpad(null, (lp) => {
    const snapshot = market.snapshot(), world = market.worldView(), hour = hourOfTick(snapshot.tick);
    const out = missingInputs(market.epoch, hour);
    out.fear = observed(world.fear, hour, "LiveMarket.worldView.fear");
    const crises = market.stormSnapshot().crises, week = crises?.crisisWeek;
    out.crisisWeek = crises ? observed(!!week && snapshot.tick >= week.startTick && snapshot.tick < week.endTick, hour, "LiveMarket.stormSnapshot.crisisWeek")
      : missing("crisisWeek", "scheduler snapshot unavailable");
    out.regime = observed(world.regime, hour, "LiveMarket.worldView.regime (internal)");
    const gx = snapshot.quotes.rows.GX, dp = ASSET_BY_ID.GX?.displayDecimals;
    const mark = gx && dp !== undefined ? parseMinor(gx.last, dp) : null;
    out.gx = mark !== null && mark > 0 ? observed(mark, hour, "LiveMarket.snapshot.GX") : missing("GX", "quote unavailable");
    // LiveMarket keeps only GX.last per quote; no intra-hour high exists to read. Report it missing, never last-as-high.
    out.gxHigh = missing("gxHigh", "LiveMarket snapshot exposes GX.last only; no intra-hour high is recorded");
    // Bank health: sys/banking-core's ledger read model is unmerged, default-off and unmounted, and its regions have no
    // agreed mapping to catalog blocs. Seam, not a live read (docs/v1/units/policy-recovery.md).
    out.banks = missing("banks", "no mounted bank-health read model; banking-core ledger adapter is a before-mount seam");
    const graduated = lp.coins.filter((c) => c.grad && c.book);
    const hype = graduated.map((c) => market.hypeOf(c.ticker)).filter((h): h is number => h !== null);
    out.cryptoHype = graduated.length > 0 && hype.length === graduated.length
      ? observed(hype.reduce((n, h) => n + h, 0) / graduated.length, hour, "mean current graduated-coin hype; unweighted")
      : missing("cryptoHype", graduated.length ? "not all graduated coins listed on clock" : "no graduated crypto cohort");
    out.launchpad = observed({ graduated: graduated.length, cashCents: graduated.reduce((n, c) => n + (c.book?.cash ?? 0), 0),
      poolSamples: graduated.filter((c) => c.pools).length, liquidating: graduated.filter((c) => c.pools?.liq?.st === "LIQ").length }, hour, "locked committed Launchpad book/pool aggregates");
    return parseInputs(out);
  });
}

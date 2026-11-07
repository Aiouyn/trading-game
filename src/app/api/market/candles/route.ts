import { assertLocalSingleProcessAuth, jsonResponse } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { getCandles } from "@/server/market/candles";
import { getLiveMarket } from "@/server/market/clock";
import { candleHistoryReq } from "@/shell/contracts/schema";

export const dynamic = "force-dynamic";

/**
 * Public candle history for one asset (M1-07), the 19 §3.10.1 shape: `{ bars }`, ≤ 5,000 bars, span-aligned, oldest
 * first. GET ?assetId=&res=tick|hour|day&from=&to= (ticks). Quote OHLC from the server clock since this process
 * started sampling it; v = executed Broker fill quantity. No account data. GET only: it writes nothing.
 */
export async function GET(request: Request): Promise<Response> {
  assertLocalSingleProcessAuth();
  const q = new URL(request.url).searchParams;
  const int = (k: string) => (/^\d{1,15}$/.test(q.get(k) ?? "") ? Number(q.get(k)) : NaN);
  let req;
  try {
    req = candleHistoryReq({ assetId: q.get("assetId") ?? "", res: q.get("res") ?? "", from: int("from"), to: int("to") }, "req");
  } catch {
    return jsonResponse({ error: { code: "BAD_REQUEST", message: "assetId, res (tick|hour|day), from and to (ticks) are required." } }, 400);
  }
  getBroker(); // the same first-read wiring as /api/market: the sweep and the candle volume attach to the clock
  return jsonResponse({ bars: getCandles(getLiveMarket()).history(req) });
}

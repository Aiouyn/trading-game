import { AuthService } from "@/server/auth/service";
import { MemoryAuthStore, type AuthStoreSnapshot } from "@/server/auth/store";
import { LaunchpadService } from "@/server/launchpad/service";
import { BrokerService } from "@/server/broker/service";
import { LiveMarket } from "@/server/market/clock";
import { captureLiveCatalog } from "@/server/market/policyRecovery/live";
import { marketCashCents } from "@/server/launchpad/state";
class Store extends MemoryAuthStore {
  writes = 0;
  override async save(s: AuthStoreSnapshot): Promise<void> { this.writes++; await super.save(s); }
}
export async function policyLiveFixture() {
  const store = new Store(), auth = new AuthService({ store }), market = new LiveMarket({ persistStorms: false });
  const capture = async () => { const writes = store.writes, input = await captureLiveCatalog(market, auth); if (store.writes !== writes) throw new Error("CAPTURE_WROTE_AUTH"); return input; };
  const cash = async () => (await auth.readStandings((rows) => rows.reduce((n, r) => n + r.cashCents, 0)))
    + await auth.readLaunchpad(null, (lp) => lp.sinkCents + lp.coins.reduce((n, c) => n + marketCashCents(c) + (c.book?.cash ?? 0), 0));
  try {
    const before = await capture();
    const lp = new LaunchpadService({ auth: () => auth, tick: () => market.snapshot().tick, list: (d) => market.list(d) });
    const owner = (await auth.register({ handle: "SysPolicyOwner", password: "fixture-password" })).view;
    const buyers = [];
    for (let n = 0; n < 5; n++) buyers.push((await auth.register({ handle: `SysPolicyBuyer${n}`, password: "fixture-password" })).view);
    const initialCash = await cash();
    const launched = await lp.launch(owner, "sys-policy-launch", { ticker: "SYSP", name: "Policy Club", tagline: "tg5", fee: 100000 });
    if (launched.status !== "accepted") throw new Error("LIVE_LAUNCH_REFUSED");
    for (const [n, buyer] of buyers.entries()) if ((await lp.trade(buyer, `sys-policy-buy:${n}`, { ticker: "SYSP", side: "buy", amount: 1000000, min: 0 })).status !== "accepted") throw new Error("LIVE_TRADE_REFUSED");
    const afterGraduation = await capture();
    market.setHype("SYSP", .1); market.step();
    const afterHype = await capture();
    const broker = new BrokerService({ auth: () => auth, market: () => market });
    const traded = await broker.place(owner, "sys-policy-bookbuy", { assetId: "SYSP", side: "BUY", type: "market", qty: "1000", tif: "day" });
    if (traded.result.status !== "ACCEPTED") throw new Error("LIVE_BOOK_TRADE_REFUSED");
    const afterBook = await capture(), finalCash = await cash();
    return { before, afterGraduation, afterHype, afterBook, readOnlyCapture: true, cashDelta: finalCash - initialCash, initialCashCents: initialCash, finalCashCents: finalCash };
  } finally { market.stop(); }
}

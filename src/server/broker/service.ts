// M1-06 Broker door: binds the pure decisions (execution.ts) to the caller's session ledger and the server clock.
import { AuthError, type AuthService, type AuthSessionView } from "@/server/auth";
import { newId } from "@/server/auth/crypto";
import type { LiveMarket } from "@/server/market/clock";
import type { BrokerIntentReply, BrokerLedgerView } from "@/market/brokerLedger";
import type { OrderDraft } from "@/shell/contracts/channels";
import { decideCancel, decidePlace, ledgerView, quoteFromSnapshot, sweepLedger, type IdSource } from "./execution";

const randomIds: IdSource = { next: (kind) => newId(kind) };

export interface BrokerDeps {
  readonly auth: () => AuthService;
  readonly market: () => LiveMarket;
  readonly ids?: IdSource;
}

export class BrokerService {
  private readonly deps: BrokerDeps;
  private readonly ids: IdSource;
  private readonly attached = new WeakSet<LiveMarket>();

  constructor(deps: BrokerDeps) {
    this.deps = deps;
    this.ids = deps.ids ?? randomIds;
  }

  /** Subscribe the resting-order sweep to the current market clock once. */
  attach(): void {
    const market = this.deps.market();
    if (this.attached.has(market)) return;
    this.attached.add(market);
    market.onStep(() => { void this.sweep().catch((err: unknown) => { console.error("[broker] sweep failed", err); }); });
  }

  async read(session: AuthSessionView): Promise<BrokerLedgerView> {
    this.attach();
    const rec = await this.deps.auth().getPlayerPrivate(session, session.account.accountId);
    return ledgerView(rec, this.deps.market().snapshot().tick);
  }

  /** Place. Quote, checks and write happen in one locked read-modify-write on the caller's own ledger. */
  async place(session: AuthSessionView, key: string, draft: OrderDraft): Promise<BrokerIntentReply> {
    this.attach();
    let out: BrokerIntentReply["result"] | null = null;
    const market = this.deps.market();
    const next = await this.deps.auth().updateOwnPrivateState(session, (cur) => {
      const d = decidePlace(cur, key, draft, quoteFromSnapshot(market.snapshot()), this.ids);
      out = d.result;
      return d.next;
    });
    if (!out) throw new AuthError("BAD_REQUEST", "Order was not decided.", 500);
    const result: BrokerIntentReply["result"] = out;
    return { intentId: result.intentId, result, ledger: ledgerView(next, market.snapshot().tick) };
  }

  async cancel(session: AuthSessionView, key: string, orderId: string): Promise<BrokerIntentReply> {
    this.attach();
    let out: BrokerIntentReply["result"] | null = null;
    const market = this.deps.market();
    const next = await this.deps.auth().updateOwnPrivateState(session, (cur) => {
      const d = decideCancel(cur, key, orderId, market.snapshot().tick, this.ids);
      out = d.result;
      return d.next;
    });
    if (!out) throw new AuthError("BAD_REQUEST", "Cancel was not decided.", 500);
    const result: BrokerIntentReply["result"] = out;
    return { intentId: result.intentId, result, ledger: ledgerView(next, market.snapshot().tick) };
  }

  /** One server tick: fill every working limit the mark reached, across all ledgers, in one commit. */
  async sweep(): Promise<number> {
    const quote = quoteFromSnapshot(this.deps.market().snapshot());
    return this.deps.auth().sweepPrivateStates((cur) => {
      try {
        return sweepLedger(cur, quote, this.ids);
      } catch {
        return null; // an untradable ledger is left as it is (it reads 409 on its own door)
      }
    });
  }
}

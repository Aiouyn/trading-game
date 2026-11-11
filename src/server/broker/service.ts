// M1-06 Broker door: binds the pure decisions (execution.ts) to the caller's session ledger and the server clock.
import { AuthError, type AuthService, type AuthSessionView } from "@/server/auth";
import { newId } from "@/server/auth/crypto";
import type { LiveMarket } from "@/server/market/clock";
import type { ListedCoin } from "@/server/auth/service";
import type { BrokerIntentReply, BrokerLedgerView } from "@/market/brokerLedger";
import type { MyFill, OrderDraft, PreviewRes } from "@/shell/contracts/channels";
import type { ExecutedFill } from "@/server/market/candles";
import { fmt } from "@/shell/contracts/mockFeed";
import { parseMinor } from "@/market/quoteSnapshot";
import { ASSET_BY_ID } from "@/market/catalog";
import { MEME_POOL_WEIGHTS, stepPools, applyStormHype, type CoinPools } from "./pools";
import { decideCancel, decidePlace, ledgerView, reservedCashCents, quoteFromSnapshot, sweepLedger, sweepListed, type IdSource } from "./execution";
import { anonIdForAccount } from "@/server/telemetry/ids";
import { recordEventSafe } from "@/server/telemetry/events";

const randomIds: IdSource = { next: (kind) => newId(kind) };

export interface BrokerDeps {
  readonly auth: () => AuthService;
  readonly market: () => LiveMarket;
  readonly ids?: IdSource;
  /** M1-07: fills that a committed decision executed (public fields only), for the market's candle volume. */
  readonly onFills?: (fills: readonly ExecutedFill[]) => void;
  /** L4: list the saved Launchpad's graduated coins on the clock (idempotent), inside the ledger's own lock turn, before
   *  a read or a decision (src/server/launchpad). */
  readonly list?: (coins: readonly ListedCoin[]) => void;
}

/** Fills in `next` that `cur` did not have: the ones this decision executed. */
function newFills(cur: { fills?: readonly MyFill[] }, next: { fills?: readonly MyFill[] }): ExecutedFill[] {
  const had = new Set((cur.fills ?? []).map((f) => f.fillId));
  return (next.fills ?? []).filter((f) => !had.has(f.fillId)).map((f) => ({ fillId: f.fillId, assetId: f.assetId, tick: f.tick, qty: f.qty }));
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
    const { record, coins } = await this.deps.auth().readOwnLedger(session, this.deps.list);
    return ledgerView(record, this.deps.market().snapshot().tick, coins);
  }

  /** Authoritative dry-run: no ledger/book save, id allocation, candle volume, or path impact. */
  async preview(session: AuthSessionView, draft: OrderDraft): Promise<PreviewRes> {
    const market = this.deps.market();
    return this.deps.auth().previewOwnBook(session, draft.assetId, (cur, book) => {
      let n = 0;
      const q = { ...quoteFromSnapshot(market.snapshot()), depthInputs: (id: string) => market.depthInputs(id) };
      const d = decidePlace({ ...cur, intents: [] }, "preview", draft, q, { next: (kind) => `preview_${kind}_${++n}` }, book);
      const fill = d.next.fills?.at(-1);
      const fresh = fill && !(cur.fills ?? []).some((f) => f.fillId === fill.fillId) ? fill : undefined;
      const a = ASSET_BY_ID[draft.assetId], mark = q.last(draft.assetId) ?? 1, dp = a?.displayDecimals ?? 8;
      const px = fresh ? parseMinor(fresh.price, dp) ?? mark : mark;
      const paid = cur.cashCents - d.next.cashCents;
      const fee = fresh ? Math.round(Number(fresh.fee) * 100) : 0;
      const reason = d.result.status === "REJECTED" ? d.result.rejectCode : undefined;
      return { price: fmt(mark, dp), estFill: fmt(px, dp), fee: fmt(fee, 2), valid: !reason,
        ...(reason ? { reasonCode: reason } : {}), buyingPowerAfter: fmt(d.next.cashCents - reservedCashCents(d.next), 2),
        impactBp: String(Math.round(Math.abs(px / mark - 1) * 10000)), impactMoney: fmt(Math.round(Math.abs(px - mark) * Number(fresh?.qty ?? 0) / 10 ** (dp - 2)), 2),
        total: fmt(Math.abs(paid), 2), firstTradeCapRemaining: null, computedAtTick: q.tick, executableQty: fresh?.qty ?? "0" };
    }, this.deps.list);
  }

  /** Place. Quote, checks and write happen in one locked read-modify-write on the caller's own ledger. */
  async place(session: AuthSessionView, key: string, draft: OrderDraft): Promise<BrokerIntentReply> {
    this.attach();
    let out: BrokerIntentReply["result"] | null = null;
    let executed: ExecutedFill[] = [];
    const market = this.deps.market();
    // One locked step: the clock lists any graduated coin, then the decision; a listed coin (L4) fills against its book
    // account, and the ledger and the book commit together (any other asset has no book: the ledger alone changes).
    let firstAccepted = false;
    const { record: next, coins } = await this.deps.auth().updateOwnLedgerWithBook(session, draft.assetId, (cur, book) => {
      const d = decidePlace(cur, key, draft, { ...quoteFromSnapshot(market.snapshot()), depthInputs: (id: string) => market.depthInputs(id) }, this.ids, book);
      out = d.result;
      executed = d.replayed ? [] : newFills(cur, d.next);
      if (!d.replayed && d.result.status === "ACCEPTED" && !(cur.intents ?? []).some((i) => i.result.status === "ACCEPTED")) {
        firstAccepted = true;
      }
      const move = d.move;
      // the fill's permanent impact moves the coin's mark only once the fill is saved (a failed save moves nothing)
      return { next: d.next, ...(d.book ? { book: d.book } : {}), ...(move ? { saved: () => { market.impactListed(draft.assetId, move); } } : {}) };
    }, this.deps.list);
    if (!out) throw new AuthError("BAD_REQUEST", "Order was not decided.", 500);
    if (executed.length > 0) this.deps.onFills?.(executed);
    const result: BrokerIntentReply["result"] = out;
    if (firstAccepted) recordEventSafe("first_trade", anonIdForAccount(session.account.accountId));
    return { intentId: result.intentId, result, ledger: ledgerView(next, market.snapshot().tick, coins) };
  }

  async cancel(session: AuthSessionView, key: string, orderId: string): Promise<BrokerIntentReply> {
    this.attach();
    let out: BrokerIntentReply["result"] | null = null;
    const market = this.deps.market();
    const { record: next, coins } = await this.deps.auth().updateOwnLedger(session, (cur) => {
      const d = decideCancel(cur, key, orderId, market.snapshot().tick, this.ids);
      out = d.result;
      return d.next;
    });
    if (!out) throw new AuthError("BAD_REQUEST", "Cancel was not decided.", 500);
    const result: BrokerIntentReply["result"] = out;
    return { intentId: result.intentId, result, ledger: ledgerView(next, market.snapshot().tick, coins) };
  }

  /** One server tick: fill every working limit the mark reached, across all ledgers, then (L4) every resting order on a
   *  listed coin against its book, all in one commit. */
  async sweep(): Promise<number> {
    const market = this.deps.market();
    const quote = { ...quoteFromSnapshot(market.snapshot()), depthInputs: (id: string) => market.depthInputs(id) };
    const executed: ExecutedFill[] = [];
    const n = await this.deps.auth().sweepPrivateStates((cur) => {
      try {
        const next = sweepLedger(cur, quote, this.ids);
        if (next) executed.push(...newFills(cur, next));
        return next;
      } catch {
        return null; // an untradable ledger is left as it is (it reads 409 on its own door)
      }
    }, {
      ...(this.deps.list ? { list: this.deps.list } : {}),
      sweep: (ledgers, books, coins) => {
        const q = { ...quoteFromSnapshot(market.snapshot()), depthInputs: (id: string) => market.depthInputs(id) }; // after list(): a coin listed in this turn has its mark
        const out = sweepListed(ledgers, books, q, this.ids);
        for (const [id, next] of out.ledgers) executed.push(...newFills(ledgers.get(id)!, next));
        // then the coins' trader pools (src/server/broker/pools.ts), once a tick, against the books as just swept
        const pools = new Map<string, CoinPools>();
        const moves = [...out.moves];
        const liqWires: { assetId: string; tick: number; qty: number }[] = [];
        const shocks = market.takeStormHype?.() ?? [];
        for (const [ticker, c] of coins) {
          const a = ASSET_BY_ID[ticker], inp = market.poolInputs?.(ticker) ?? null, mark = q.last(ticker), book = out.books.get(ticker) ?? books.get(ticker);
          if (!a || !inp || mark === null || !book || !q.tradable(ticker) || inp.tick !== q.tick) continue;
          const step = stepPools(a, MEME_POOL_WEIGHTS, c.price, c.pools, book, mark, inp, market.epoch, market.depthInputs(ticker) ?? undefined);
          // CRYPTO_FLUSH hype: apply even when the pools already acted this tick (still durable + idempotent)
          let nextPools = step?.pools ?? (c.pools ? structuredClone(c.pools) : null);
          if (nextPools && shocks.length) {
            for (const s of shocks) nextPools = applyStormHype(nextPools, s.stormId, s.delta);
          }
          if (step) {
            out.books.set(ticker, step.book);
            for (const [i, pr] of step.prints.entries()) {
              executed.push({ fillId: `npc_${market.epoch}_${pr.tick}_${ticker}_${pr.pool}`, assetId: ticker, tick: pr.tick, qty: String(pr.qty) });
              moves.push({ assetId: ticker, move: step.moves[i]! });
            }
            if (step.liqWire) liqWires.push({ assetId: step.liqWire.assetId, tick: step.liqWire.tick, qty: step.liqWire.qty });
          }
          if (nextPools && (step || shocks.length)) pools.set(ticker, nextPools);
        }
        // after the save only: the fills' permanent moves and the saved hype the coins' paths read next (06 "05 applies")
        return { ledgers: out.ledgers, books: out.books, pools, saved: () => {
          for (const m of moves) market.impactListed(m.assetId, m.move);
          for (const [ticker, p] of pools) market.setHype(ticker, p.h);
          for (const ev of liqWires) market.announceDegenLiq?.(ev);
        } };
      },
    });
    // Only after the commit: a failed write throws above and adds no volume.
    if (executed.length > 0) this.deps.onFills?.(executed);
    return n;
  }
}

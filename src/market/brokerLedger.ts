// M1-06 Broker ledger wire shape, shared by the server door (src/server/broker) and the signed-in feed.
// The server owns every number here; the client parses it at the boundary and never trusts a malformed reply.
import type { CoinRow, IntentResult, MyFill, OpenOrder, OrderDraft, OrderHistoryRow } from "@/shell/contracts/channels";
import { arr, coinRow, int, intentResult, myFill, obj, openOrder, ParseError, rec, str, dec } from "@/shell/contracts/schema";
import { orderHistoryRow } from "@/shell/contracts/orderHistory";

/** The caller's own saved Broker state at one server tick. */
export interface BrokerLedgerView {
  readonly tick: number;
  readonly cashCents: number;
  /** Cash held by working buy limits (remaining × limit + fee). Spendable = cashCents − reservedCashCents. */
  readonly reservedCashCents: number;
  readonly positions: Readonly<Record<string, { readonly assetId: string; readonly qty: string; readonly avgCost: string }>>;
  readonly orders: Readonly<Record<string, OpenOrder>>;
  readonly fills: readonly MyFill[];
  readonly intents: readonly IntentResult[];
  /** Closed orders (EXPIRED at day close), oldest first, last 50. Omitted or empty if none; the server always sends the array. */
  readonly history?: readonly OrderHistoryRow[];
  /** Own Launchpad coins, read with this ledger in one locked step; their value counts in net worth once. */
  readonly coins: readonly CoinRow[];
}

/** POST /api/broker/orders and /api/broker/orders/cancel reply. */
export interface BrokerIntentReply {
  readonly intentId: string;
  readonly result: IntentResult;
  readonly ledger: BrokerLedgerView;
}

export interface PlaceRequest { readonly idempotencyKey: string; readonly draft: OrderDraft }
export interface CancelRequest { readonly idempotencyKey: string; readonly orderId: string }

const position = obj({ assetId: str, qty: dec, avgCost: dec });
const ledgerSchema = obj({
  tick: int,
  cashCents: int,
  reservedCashCents: int,
  positions: rec(position),
  orders: rec(openOrder),
  fills: arr(myFill),
  intents: arr(intentResult),
  coins: arr(coinRow),
}, { history: arr(orderHistoryRow) });
const replySchema = obj({ intentId: str, result: intentResult, ledger: ledgerSchema });

/** Strict parse; null for anything that is not exactly this shape with non-negative cash. */
export function parseBrokerLedger(raw: unknown): BrokerLedgerView | null {
  try {
    const v = ledgerSchema(raw, "ledger");
    if (v.cashCents < 0 || v.reservedCashCents < 0 || v.reservedCashCents > v.cashCents || v.tick < 0) return null;
    return { ...v, history: v.history ?? [] };
  } catch (e) {
    if (e instanceof ParseError) return null;
    throw e;
  }
}

export function parseBrokerIntentReply(raw: unknown): BrokerIntentReply | null {
  try {
    const v = replySchema(raw, "reply");
    if (v.result.intentId !== v.intentId) return null;
    const ledger = parseBrokerLedger(v.ledger);
    return ledger ? { intentId: v.intentId, result: v.result, ledger } : null;
  } catch (e) {
    if (e instanceof ParseError) return null;
    throw e;
  }
}

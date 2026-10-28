// Order rules Engine has not defined yet (UI card 6 Gaps 1-4, Producer E-98 (1)). ONE seam: the mock server and the
// Broker UI read these values and nothing else. When Engine rules, change the value (or widen its type) here; no other
// file names a default. Every field is ENGINE-TBD.
import type { TradingState } from "./channels";

export interface OrderPolicy {
  /** Gap 1 (idempotent cancel): a cancel for an order id that is not open. The mock answers ACCEPTED with no effects;
   *  Engine may instead reject with a code (none exists on main). */
  readonly cancelUnknown: { readonly status: "ACCEPTED" } | { readonly status: "REJECTED"; readonly code: string };
  /** Gap 2 (halt / suspension): trading states in which a cancel is accepted (Quant E-96 (3)). A cancel in any other
   *  state is rejected with `cancelClosedCode`. The mock only has CONTINUOUS and HALTED. */
  readonly cancelIn: readonly TradingState[];
  readonly cancelClosedCode: string;
  /** Gap 3 (partly filled): what a cancel does to an order with fills. "removeRemainder": the order leaves `me.orders`,
   *  the filled part stays in holdings. `OpenOrder.status` has no CANCELLED value, so no other option is typed yet. */
  readonly cancelPartlyFilled: "removeRemainder";
  /** Gap 4 (cancel vs fill race): the UI follows `me` only. "removeRow": an order that leaves `me.orders` before our
   *  IntentResult drops out of the list at once; the result is reported in the status line when it arrives. */
  readonly cancelGoneBeforeResult: "removeRow";
  /** Producer E-98 (1): the status a priced order (limit, stop, stop limit) placed on a halted asset rests with.
   *  QUEUED_AUCTION reads "Waits for reopen", like a halted market order; WORKING was card 5's mock. */
  readonly haltedRestingStatus: "QUEUED_AUCTION" | "WORKING";
}

/** The mock defaults (card 6 spec). */
export const ORDER_POLICY: OrderPolicy = {
  cancelUnknown: { status: "ACCEPTED" },
  cancelIn: ["CONTINUOUS", "HALTED", "VOL_INTERRUPTION", "LIMIT_LOCKED", "SUSPENDED"],
  cancelClosedCode: "MKT_HALTED",
  cancelPartlyFilled: "removeRemainder",
  cancelGoneBeforeResult: "removeRow",
  haltedRestingStatus: "QUEUED_AUCTION",
};

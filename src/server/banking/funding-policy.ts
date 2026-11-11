import type { Money } from "../../../packages/engine/core/types";

interface FundingPosition {
  ownedCash: Money; custodyCash: Money; incoming: Money; outgoing: Money; depositsDue: Money;
}

/** Provisional funded-reserve reading, not an owner-approved override of 07:23. See SYS-BANKING.md. */
export const BANK_FUNDING_POLICY = {
  projectedGap({ ownedCash, custodyCash, incoming, outgoing, depositsDue }: FundingPosition): Money {
    // Owned cash is reserves less 100% custody. Preserve the existing upward-rounded 0.5% buffer.
    const buffer = (custodyCash + BigInt(199)) / BigInt(200);
    return ownedCash + incoming - outgoing - depositsDue - buffer;
  },
  lendableCash({ ownedCash, outgoing, depositsDue }: Pick<FundingPosition, "ownedCash" | "outgoing" | "depositsDue">): Money {
    const available = ownedCash - outgoing - depositsDue;
    return available > BigInt(0) ? available : BigInt(0);
  },
};

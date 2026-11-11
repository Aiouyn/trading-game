import type { Money } from "../../../packages/engine/core/types";
interface ReservePosition { reserves: Money; deposits: Money; incoming: Money; outgoing: Money; depositsDue: Money }
/** FDL -> FU, 07:388 and 541: 1% reserve requirement plus 0.5% buffer. No CB credit. */
export const BANK_FUNDING_POLICY = {
  projectedGap({ reserves, deposits, incoming, outgoing, depositsDue }: ReservePosition): Money {
    const required = ((deposits + depositsDue) * BigInt(15) + BigInt(999)) / BigInt(1000);
    return reserves + incoming - outgoing - required;
  },
  lendableReserves({ reserves, outgoing }: Pick<ReservePosition, "reserves" | "outgoing">): Money {
    return reserves > outgoing ? reserves - outgoing : BigInt(0);
  },
};

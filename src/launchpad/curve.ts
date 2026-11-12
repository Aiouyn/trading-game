// The curve's virtual start reserves (p10 L2), on their own so the lazy History chart reads them without pulling in the
// trade rules and the Broker fee they import (that import otherwise grows the shell's first-load chunks; S1-20).
export const CURVE = {
  X0: 1_500_000, // $15,000 virtual cash, in cents
  Y0: 1_073_000_000,
} as const;

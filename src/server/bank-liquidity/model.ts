import type { Money, Tick } from "../../../packages/engine/core/types";
export type LiquiditySector = "NATURAL" | "OPERATIONAL" | "CORPORATE" | "FINANCIAL";
export type LiquidityRank = "SECURED" | "COST" | "INSURED" | "SENIOR" | "SUB" | "AT1";
export type LiquidityAssetKind = "L1" | "L2A" | "L2B" | "SECURITY" | "MORTGAGE" | "LOAN";
export interface LiquidityAccountSeed {
    id: string;
    bankId: string | null;
    owner: string;
    group: string;
    control: "PLAYER" | "NPC";
    sector: LiquiditySector;
    cash: Money;
}
export interface LiquidityLot {
    lineage: string;
    amount: Money;
    countedAt: Tick | null;
}
export interface LiquidityAccount extends Omit<LiquidityAccountSeed, "cash"> {
    lots: LiquidityLot[];
}
export interface LiquidityBankSeed {
    id: string;
    ownerAccountId: string;
    bloc: string;
    tier: string;
    segment: string;
    npc: boolean;
    sib: boolean;
    sibSurchargePpm: number;
    reserves: Money;
}
export interface LiquidityAsset {
    id: string;
    kind: LiquidityAssetKind;
    markPpm: number;
    rwPpm: number;
    adv: Money;
    collateralFor: string | null;
    holdings: {
        bankId: string | null;
        accountId: string | null;
        quantity: Money;
    }[];
}
export interface LiquidityNote {
    id: string;
    bankId: string;
    creditor: string;
    rank: LiquidityRank;
    instrument: "BOND" | "INTERBANK" | "OTHER";
    amount: Money;
    longTerm: boolean;
}
export interface LiquidityGenesis {
    world: string;
    ccy: "FDL";
    banks: LiquidityBankSeed[];
    accounts: LiquidityAccountSeed[];
    assets: LiquidityAsset[];
    notes: LiquidityNote[];
    dgf: {
        bloc: string;
        cash: Money;
    }[];
}
export interface LiquidityObservation {
    bankId: string;
    publishedCet1Ppm: number;
    publishedRwa: Money;
    publicLoss: Money;
    equityReturnPpm: number | null;
    cdsBps: number | null;
    rumors: {
        source: string;
        intensityPpm: number;
    }[];
    stigma: boolean;
    exposures: {
        bankId: string;
        amount: Money;
    }[];
    ccybPpm: number;
    rrPpm: number;
    mlfrPpm: number;
    intangibles: Money;
    dta: Money;
    unbookedLoss: Money;
    rwaAddon: Money;
    commitments: Money;
    financialCommitments: Money;
    derivativeExposure: Money;
    loanInflows: Money;
    interbankInflows: Money;
    maturingLiabilities: Money;
    regulatorFailure: boolean;
}
export interface LiquidityAssetBid {
    id: string;
    buyer: {
        kind: "BANK" | "ACCOUNT";
        id: string;
    };
    assetId: string;
    quantity: Money;
    pricePpm: number;
}
export interface LiquidityFacts {
    banks: LiquidityObservation[];
    marks: {
        assetId: string;
        markPpm: number;
    }[];
    bids: LiquidityAssetBid[];
}
type LiquidityIntentBase = {
    id: string;
    actor: string;
};
export type LiquidityIntent = LiquidityIntentBase & ({
    kind: "MOVE";
    from: string;
    to: string;
    amount: Money;
} | {
    kind: "CAPITAL";
    bankId: string;
    accountId: string;
    amount: Money;
} | {
    kind: "BID";
    bankId: string;
    buyerBankId: string;
    price: Money;
    capitalInjection: Money;
});
export interface LiquidityFrame {
    tick: Tick;
    facts: LiquidityFacts | null;
    commands: LiquidityIntent[];
}
export interface LiquidityPayment {
    id: string;
    from: string;
    to: string;
    amount: Money;
    created: Tick;
}
export interface LiquidityResolutionBid {
    id: string;
    bankId: string;
    buyerBankId: string;
    price: Money;
    capitalInjection: Money;
}
export interface LiquidityResolution {
    opened: Tick;
    auctionEnd: Tick;
    insuranceDeadline: Tick;
    liquidationDeadline: Tick;
    trigger: "SOLVENCY" | "LIQUIDITY" | "REGULATOR";
    tool: "AUCTION" | "PA" | "BAIL_IN" | "LIQUIDATION";
    bids: LiquidityResolutionBid[];
    insuranceUsed: {
        group: string;
        amount: Money;
    }[];
    collateralRecovered: {
        noteId: string;
        amount: Money;
    }[];
    creditorLosses: {
        id: string;
        amount: Money;
    }[];
    equityRights: {
        creditor: string;
        amount: Money;
    }[];
    insuranceShortfall: Money;
    estatePending: boolean;
    finalized: boolean;
}
export interface LiquidityBank extends LiquidityBankSeed {
    status: "ACTIVE" | "WATCH" | "RESTRICTED" | "IN_RESOLUTION" | "LIQUIDATING" | "SOLD" | "CLOSED";
    confidence: number;
    run: boolean;
    calmSince: Tick | null;
    failedAt: Tick | null;
    ownerWiped: boolean;
    charterBanUntil: Tick | null;
    outflows: {
        tick: Tick;
        amount: Money;
        base: Money;
    }[];
    resolution: LiquidityResolution | null;
}
export interface LiquidityState {
    world: string;
    tick: Tick;
    banks: LiquidityBank[];
    accounts: LiquidityAccount[];
    assets: LiquidityAsset[];
    notes: LiquidityNote[];
    dgf: {
        bloc: string;
        cash: Money;
    }[];
    mmfCash: Money;
    mmfClaims: {
        owner: string;
        group: string;
        amount: Money;
    }[];
    authorityCash: Money;
    sinks: Money;
    openingM0: Money;
    openingPositions: {
        assetId: string;
        quantity: Money;
    }[];
    queue: LiquidityPayment[];
    history: {
        tick: Tick;
        bankId: string;
        kind: string;
        amount: Money;
    }[];
    receipts: {
        id: string;
        fingerprint: string;
        outcome: string;
    }[];
    facts: LiquidityFacts | null;
}
export interface LiquidityCheckpointStore {
    load(): Promise<{
        revision: string | null;
        payload: unknown;
    }>;
    save(payload: unknown, expectedRevision: string | null): Promise<string>;
}

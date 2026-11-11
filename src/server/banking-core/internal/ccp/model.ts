import type { Money, Qty, Tick } from "../../../../../packages/engine/core/types";
export type MarginCcpServiceId = "LD" | "OTC" | "CDS" | "REPO";
export interface MarginCcpMember {
    id: string;
    owner: string;
    npc: boolean;
    accounts: {
        service: MarginCcpServiceId;
        targetDf: Money;
    }[];
}
export interface MarginCcpGenesis {
    world: string;
    ccy: "FDL";
    members: (Omit<MarginCcpMember, "accounts"> & {
        wallet: Money;
        accounts: {
            service: MarginCcpServiceId;
            targetDf: Money;
            marginCash: Money;
            df: Money;
        }[];
    })[];
    services: {
        id: MarginCcpServiceId;
        sitg1: Money;
        sitg2: Money;
        owners: {
            memberId: string;
            weightPpm: number;
        }[];
    }[];
}
export interface MarginCcpPosition {
    assetId: string;
    quantity: Qty;
    fairValue: Money;
    marginalIm: Money;
    expectedCost: Money;
    sigmaPpm: number;
    expectedTickVolume: Qty;
    marketOpen: boolean;
    opening: boolean;
    openingVolume: Qty;
}
export interface MarginCcpRisk {
    memberId: string;
    service: MarginCcpServiceId;
    im: Money;
    equityAdjustment: Money;
    held: boolean;
    positions: MarginCcpPosition[];
}
export interface MarginCcpCloseout {
    defaultId: string;
    sourceId: string;
    loss: Money;
    claims: {
        memberId: string;
        amount: Money;
    }[];
    scores: {
        memberId: string;
        distance: Money;
    }[];
}
export interface MarginCcpFacts {
    risks: MarginCcpRisk[];
    defaults: {
        memberId: string;
        service: MarginCcpServiceId;
        reason: "BANK_RESOLUTION" | "REGULATOR";
    }[];
    closeouts: MarginCcpCloseout[];
    vm: {
        service: MarginCcpServiceId;
        fromMemberId: string;
        toMemberId: string;
        amount: Money;
    }[];
}
export type MarginCcpCommand = {
    id: string;
    actor: string;
} & ({
    kind: "POST_MARGIN";
    memberId: string;
    service: MarginCcpServiceId;
    amount: Money;
} | {
    kind: "PAY_CALL";
    callId: string;
    amount: Money;
});
export interface MarginCcpFrame {
    tick: Tick;
    facts: MarginCcpFacts;
    commands: MarginCcpCommand[];
}
export interface MarginCcpOrder {
    created: Tick;
    eligibleAt: Tick;
    memberId: string;
    service: MarginCcpServiceId;
    assetId: string;
    side: "BUY" | "SELL";
    quantity: Qty;
    limitPrice: Money;
    bandPpm: number;
    openingOnly: boolean;
}
export interface MarginCcpMargin {
    memberId: string;
    service: MarginCcpServiceId;
    status: "OK" | "CALL" | "DEFAULTED";
    call: {
        issued: Tick;
        due: Tick;
        amount: Money;
    } | null;
    liquidationSince: Tick | null;
}
export interface MarginCcpFundingCall {
    id: string;
    eventId: string;
    memberId: string;
    service: MarginCcpServiceId;
    kind: "ASSESSMENT" | "DF";
    amount: Money;
    paid: Money;
    cancelled: Money;
    issued: Tick;
    due: Tick;
}
export type MarginCcpLayer = "DEFAULTER_IM" | "DEFAULTER_DF" | "SITG1" | "SURVIVOR_DF_JUNIOR" | "SURVIVOR_DF" | "SITG2" | "ASSESSMENT" | "VMGH";
export interface MarginCcpDefault {
    id: string;
    memberId: string;
    service: MarginCcpServiceId;
    declared: Tick;
    reason: string;
    closeout: MarginCcpCloseout | null;
    reportFingerprint: string | null;
    remaining: Money;
    claims: {
        memberId: string;
        amount: Money;
        paid: Money;
    }[];
    layers: {
        layer: MarginCcpLayer;
        amount: Money;
    }[];
    fundingIssued: boolean;
    fundingAt: Tick | null;
    managementClosed: boolean;
    stage: "MANAGEMENT" | "ASSESSING" | "VMGH" | "CLOSED" | "SHORTFALL";
    vmghStart: Tick | null;
    vmghUntil: Tick | null;
    ownerLosses: {
        memberId: string;
        amount: Money;
    }[];
}
export interface MarginCcpState {
    world: string;
    tick: Tick;
    members: MarginCcpMember[];
    services: {
        id: MarginCcpServiceId;
        status: "OPEN" | "DEFAULT_MANAGEMENT" | "RECOVERY" | "CLOSED";
        targetSitg: Money;
        owners: {
            memberId: string;
            weightPpm: number;
        }[];
    }[];
    cash: {
        id: string;
        amount: Money;
    }[];
    openingCash: {
        id: string;
        amount: Money;
    }[];
    openingM0: Money;
    margins: MarginCcpMargin[];
    defaults: MarginCcpDefault[];
    fundingCalls: MarginCcpFundingCall[];
    assessmentHistory: {
        eventId: string;
        memberId: string;
        service: MarginCcpServiceId;
        issued: Tick;
        amount: Money;
    }[];
    orders: MarginCcpOrder[];
    attempts: {
        memberId: string;
        service: MarginCcpServiceId;
        assetId: string;
        quantity: Qty;
        unfilled: number;
        lastOrderTick: Tick;
    }[];
    transfers: {
        tick: Tick;
        from: string;
        to: string;
        amount: Money;
        reason: string;
        eventId: string | null;
    }[];
    history: {
        tick: Tick;
        kind: string;
        memberId: string | null;
        service: MarginCcpServiceId;
        eventId: string | null;
    }[];
    receipts: {
        id: string;
        fingerprint: string;
        outcome: string;
    }[];
    facts: MarginCcpFacts | null;
}
export interface MarginCcpCheckpointStore {
    load(): Promise<{
        revision: string | null;
        payload: unknown;
    }>;
    save(payload: unknown, expectedRevision: string | null): Promise<string>;
}

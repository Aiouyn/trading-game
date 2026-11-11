import type {Money} from "../../../packages/engine/core/types";
import type {LiquidityGenesis,LiquidityState} from "./internal/liquidity/model";
import type {BankingGenesis,BankingFrame,BankingState,FundedInterbankLoan} from "./internal/banking/model";
import type {CreditGenesis,CreditState,CreditLoan,CreditFrame} from "./internal/credit/model";
import type {MarginCcpGenesis,MarginCcpState,MarginCcpFrame,MarginCcpServiceId} from "./internal/ccp/model";
import type {LiquidityFrame} from "./internal/liquidity/model";
export type CashBinding={kind:"ACCOUNT";id:string}|{kind:"BANK";id:string};
export interface BankingConfig {initialPolicyPpm:number;initialOnrPpm:number;banks:Omit<BankingGenesis["banks"][number],"cash">[];clients:(Omit<BankingGenesis["clients"][number],"cash">&{walletAccountId:string})[];}
export interface CreditConfig {bank:CreditGenesis["bank"];clients:{id:string;kind:"PERSON"|"COMPANY";homeAccountId:string;accountIds:string[]}[];supplierAccountId:string;}
export interface CcpConfig {members:{id:string;owner:string;npc:boolean;wallet:CashBinding;bankId:string|null;accounts:{service:MarginCcpServiceId;targetDf:Money;marginAccountId:string;dfAccountId:string}[]}[];services:{id:MarginCcpServiceId;sitg1AccountId:string;sitg2AccountId:string;vmAccountId:string;owners:{memberId:string;weightPpm:number}[]}[];}
export interface CoreGenesis {ledger:LiquidityGenesis;liquidityEnabled:boolean;banking:BankingConfig|null;credit:CreditConfig[];ccp:CcpConfig|null;}
export type BankingMeta=Omit<BankingState,"banks"|"clients"|"deposits"|"loans"|"businessLoans"|"world"|"ccy"|"tick">&{products:{id:string;product:"SIGHT"|"SAVINGS";interestDue:Money}[];interbank:Omit<FundedInterbankLoan,"principal">[];};
export type CreditMeta=Omit<CreditState,"world"|"ccy"|"tick"|"bank"|"clients"|"supplier"|"bankBook"|"loans">&{bankId:string;accountIds:{clientId:string;ids:string[]}[];income:Money;writtenOff:Money;loans:(Omit<CreditLoan,"principal">&{assetId:string})[];};
export type CcpMeta=Omit<MarginCcpState,"cash"|"openingCash"|"openingM0">;
export interface CoreState extends LiquidityState {bankingMeta:BankingMeta|null;creditBooks:CreditMeta[];ccpMeta:CcpMeta|null;config:Omit<CoreGenesis,"ledger">;cashOwnership:{accountId:string;bankId:string;weightPpm:number}[];audit:{tick:number;phase:string;before:string;after:string;changes:{path:string;before:string;after:string}[]}[];}
export interface CoreFrame {tick:number;banking:BankingFrame|null;credit:{bankId:string;frame:CreditFrame}[];liquidity:LiquidityFrame|null;ccp:MarginCcpFrame|null;}
export interface CoreStore {load():Promise<{revision:string|null;payload:unknown}>;save(payload:unknown,expectedRevision:string|null):Promise<string>;}
export type SynthesizedGenesis={banking:BankingGenesis|null;credit:CreditGenesis[];ccp:MarginCcpGenesis|null};

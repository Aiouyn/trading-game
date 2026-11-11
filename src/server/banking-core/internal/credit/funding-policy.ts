import type {Money} from "../../../../../packages/engine/core/types";
import type {CreditCashAccount,CreditClient,CreditLoan,CreditMovement,CreditState} from "./model";
import {creditFingerprint} from "./input";
import {context,binding} from "../../views";
import {coreAccount,coreBank,availableCash,moveCash,setAccountCash,loanAsset,payLoanOwners} from "../../ledger";
export const CREDIT_MONEY_POLICY="BANK_DEPOSIT_CREATION_SPEC_07" as const;
const Z=BigInt(0);
export interface CashRef{key:string;bucket:{cash:Money};}
export const accountRef=(c:CreditClient,a:CreditCashAccount):CashRef=>({key:"account:"+creditFingerprint({clientId:c.id,accountId:a.id}),bucket:a});
export const creditCashTotal=(s:CreditState):Money=>s.clients.flatMap(c=>c.accounts).reduce((n,a)=>n+a.cash,Z)+s.supplier.cash;
export const creditReserved=(s:CreditState):Money=>s.offers.filter(o=>o.status==="OPEN").reduce((n,o)=>n+o.amount,Z)+s.loans.reduce((n,l)=>n+l.undrawn,Z);
export const canCommitCredit=(s:CreditState,n:Money):boolean=>creditReserved(s)+s.loans.reduce((n,l)=>n+l.principal,Z)+n<=s.bank.exposureLimit;
export const availableTransfer=(s:CreditState,from:CashRef,to:CashRef):Money=>availableCash(context(s).root,binding(from.bucket),binding(to.bucket));
export function canRouteCredit(s:CreditState,id:string,n:Money):boolean{const {root}=context(s),a=coreAccount(root,id);return a.bankId===s.bank.id||coreBank(root,s.bank.id).reserves>=n;}
export function availableLoanPayment(s:CreditState,l:CreditLoan,from:CashRef):Money{const {root,credit}=context(s),a=loanAsset(root,credit!,l.id);let cap=from.bucket.cash;for(const h of a.holdings){const to=h.bankId?{kind:"BANK" as const,id:h.bankId}:{kind:"ACCOUNT" as const,id:h.accountId!};const limit=availableCash(root,binding(from.bucket),to);if(limit<cap)cap=limit;}return cap;}
export function transfer(s:CreditState,from:CashRef,to:CashRef,n:Money,kind:CreditMovement["kind"]):void{if(n===Z)return;moveCash(context(s).root,binding(from.bucket),binding(to.bucket),n);s.movements.push({tick:s.tick,from:from.key,to:to.key,amount:n,kind,loanId:null});}
/** The only deposit-issuance path. Called only by accepted underwriting or a live approved line draw. */
export function createLoanDeposit(s:CreditState,l:CreditLoan,to:CashRef,n:Money):void{const {root}=context(s),ref=binding(to.bucket);if(n<=Z||n>l.undrawn||s.bankBook.equity<=Z||ref.kind!=="ACCOUNT"||coreAccount(root,ref.id).bankId!==s.bank.id)throw new Error("CREDIT_CREATION_LIMIT");l.undrawn-=n;l.principal+=n;setAccountCash(root,ref.id,to.bucket.cash+n);s.movements.push({tick:s.tick,from:"bank:loan-asset",to:to.key,amount:n,kind:"CREDIT_CREATE",loanId:l.id});}
export function receiveBankPayment(s:CreditState,l:CreditLoan,from:CashRef,n:Money,kind:CreditMovement["kind"]):void{if(n===Z)return;const {root,credit}=context(s);payLoanOwners(root,credit!,l.id,binding(from.bucket),n);if(kind!=="REPAY_PRINCIPAL")s.bankBook.income+=n;s.movements.push({tick:s.tick,from:from.key,to:kind==="REPAY_PRINCIPAL"?"bank:destroy-principal":"bank:income",amount:n,kind,loanId:l.id});}
export function writeOffLoan(s:CreditState,l:CreditLoan):void{const {root,credit}=context(s),n=l.principal-l.chargedOff;l.chargedOff+=n;s.bankBook.writtenOff+=n;loanAsset(root,credit!,l.id).markPpm=0;}
export function recoverWrittenOffPrincipal(s:CreditState,l:CreditLoan,n:Money):void{const q=n<l.chargedOff?n:l.chargedOff;l.chargedOff-=q;s.bankBook.writtenOff-=q;}
export function creditBalanceSheet(s:CreditState){return {deposits:creditCashTotal(s),grossLoans:s.loans.reduce((n,l)=>n+l.principal,Z),netLoans:s.loans.reduce((n,l)=>n+l.principal-l.chargedOff,Z),physicalReserves:s.bankBook.reserves,equity:s.bankBook.equity,reservesNetOfEquity:s.bankBook.reserves-s.bankBook.equity};}

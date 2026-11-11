import type {Money} from "../../../packages/engine/core/types";
import type {CoreState,CashBinding,CreditMeta} from "./model";
import {balance,liquiditySheet,prorata,hashOrder} from "./internal/liquidity/accounting";
import {liquidityMove} from "./internal/liquidity/engine";
const Z=BigInt(0);
export const coreAccount=(s:CoreState,id:string)=>{const a=s.accounts.find(a=>a.id===id);if(!a)throw new Error("CORE_ACCOUNT_REFERENCE");return a;};
export const coreBank=(s:CoreState,id:string)=>{const b=s.banks.find(b=>b.id===id);if(!b)throw new Error("CORE_BANK_REFERENCE");return b;};
export const cashValue=(s:CoreState,b:CashBinding):Money=>b.kind==="BANK"?coreBank(s,b.id).reserves:balance(coreAccount(s,b.id));
export function setAccountCash(s:CoreState,id:string,n:Money):void{const a=coreAccount(s,id),old=balance(a);if(n<Z)throw new Error("CORE_NEGATIVE_CASH");if(n>=old){if(n>old)a.lots.push({lineage:"core/"+s.tick+"/"+id,amount:n-old,countedAt:null});return;}let left=old-n;for(const l of a.lots){const take=l.amount<left?l.amount:left;l.amount-=take;left-=take;}a.lots=a.lots.filter(l=>l.amount>Z);}
export function availableCash(s:CoreState,from:CashBinding,to:CashBinding):Money{const cash=cashValue(s,from);if(from.kind==="BANK")return cash;const a=coreAccount(s,from.id);if(a.bankId===null)return cash;const b=coreBank(s,a.bankId);if(to.kind==="ACCOUNT"&&coreAccount(s,to.id).bankId===a.bankId||to.kind==="BANK"&&to.id===a.bankId)return cash;if(!["ACTIVE","WATCH","RESTRICTED"].includes(b.status))return Z;return cash<b.reserves?cash:b.reserves;}
export function moveCash(s:CoreState,from:CashBinding,to:CashBinding,n:Money):void{
 if(n<Z||availableCash(s,from,to)<n)throw new Error("CORE_UNFUNDED_TRANSFER");if(n===Z)return;
 if(from.kind==="ACCOUNT"&&to.kind==="ACCOUNT"){if(!liquidityMove(s,{id:"@policy/"+s.tick,from:from.id,to:to.id,amount:n,created:s.tick}))throw new Error("CORE_UNSETTLED_TRANSFER");return;}
 if(from.kind==="BANK"&&to.kind==="BANK"){if(from.id!==to.id){coreBank(s,from.id).reserves-=n;coreBank(s,to.id).reserves+=n;}return;}
 if(from.kind==="ACCOUNT"){const a=coreAccount(s,from.id),b=coreBank(s,to.id);setAccountCash(s,a.id,balance(a)-n);if(a.bankId!==b.id){if(a.bankId)coreBank(s,a.bankId).reserves-=n;b.reserves+=n;}return;}
 const a=coreAccount(s,to.id),b=coreBank(s,from.id);if(a.bankId!==b.id){b.reserves-=n;if(a.bankId)coreBank(s,a.bankId).reserves+=n;}setAccountCash(s,a.id,balance(a)+n);
}
export function loanAsset(s:CoreState,m:CreditMeta,id:string){const l=m.loans.find(l=>l.id===id);if(!l)throw new Error("CORE_LOAN_REFERENCE");const a=s.assets.find(a=>a.id===l.assetId);if(!a)throw new Error("CORE_LOAN_ASSET_REFERENCE");return a;}
export function loanPrincipal(s:CoreState,m:CreditMeta,id:string):Money{return loanAsset(s,m,id).holdings.reduce((n,h)=>n+h.quantity,Z);}
export function setLoanPrincipal(s:CoreState,m:CreditMeta,id:string,n:Money):void{const a=loanAsset(s,m,id),old=loanPrincipal(s,m,id);if(n<Z)throw new Error("CORE_LOAN_PRINCIPAL");if(n>old){let h=a.holdings.find(h=>h.bankId===m.bankId);if(!h){h={bankId:m.bankId,accountId:null,quantity:Z};a.holdings.push(h);}h.quantity+=n-old;}else if(n<old){for(const r of prorata(a.holdings,old-n,h=>h.quantity,h=>h.bankId??h.accountId!))r.item.quantity-=r.paid;} }
export function payLoanOwners(s:CoreState,m:CreditMeta,id:string,from:CashBinding,n:Money):void{const a=loanAsset(s,m,id),rows=[...a.holdings].filter(h=>h.quantity>Z).sort((a,b)=>hashOrder(a.bankId??a.accountId!,b.bankId??b.accountId!)),total=rows.reduce((n,h)=>n+h.quantity,Z);if(total===Z){moveCash(s,from,{kind:"BANK",id:m.bankId},n);return;}const payments=rows.map(h=>({h,amount:n*h.quantity/total}));let dust=n-payments.reduce((n,p)=>n+p.amount,Z);for(const p of payments)if(dust>Z){p.amount++;dust--;}for(const p of payments)moveCash(s,from,p.h.bankId?{kind:"BANK",id:p.h.bankId}:{kind:"ACCOUNT",id:p.h.accountId!},p.amount);}
export const bankEquity=(s:CoreState,id:string):Money=>liquiditySheet(s,coreBank(s,id)).equity;

// T04-21 step 2: the 12 intent handlers in 04 §4 table order.
import type { IntentHandler } from '@tycoon/engine-core';
import { buybackOfferIntent } from './intents/buyback';
import { primaryDealerApplyIntent, primaryDealerResignIntent } from './intents/dealer';
import { exchangeVoteIntent } from './intents/exchangeVote';
import { cbDepositIntent, cbDepositWithdrawIntent, cbElaRequestIntent, cbRepoIntent, cbRepoRepayIntent } from './intents/facilities';
import { sovBidCancelIntent, sovBidIntent } from './intents/sovBid';
import { syndicationOrderIntent } from './intents/syndication';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ModuleDef.intents is IntentHandler<any>[] (G6)
export const MACRO_INTENTS: IntentHandler<any>[] = [
  sovBidIntent, sovBidCancelIntent, buybackOfferIntent, syndicationOrderIntent, exchangeVoteIntent,
  cbRepoIntent, cbRepoRepayIntent, cbDepositIntent, cbDepositWithdrawIntent, cbElaRequestIntent,
  primaryDealerApplyIntent, primaryDealerResignIntent,
];

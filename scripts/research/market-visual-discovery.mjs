const tokens=[
 ['PEPE','ethereum','0x6982508145454Ce325dDbE47a25d4ec3d2311933'],
 ['BONK','solana','DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'],
 ['WIF','solana','EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzL4f9XwWw'],
 ['POPCAT','solana','7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr'],
 ['FARTCOIN','solana','9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump'],
 ['TRUMP','solana','6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN'],
 ['MOODENG','solana','ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY'],
 ['BOME','solana','ukHH6c7mMyiWCf1b9pnWe25HXyP2y6JxXCH4KuBMCAk']
];
for (const [sym,chain,address] of tokens) {
 const j=await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)).json();
 const xs=(j.pairs||[]).filter(x=>x.chainId===chain).sort((a,b)=>Number(b.liquidity?.usd||0)-Number(a.liquidity?.usd||0));
 console.log(JSON.stringify({sym,address,items:xs.slice(0,3).map(x=>({url:x.url,pair:x.pairAddress,dex:x.dexId,base:x.baseToken,quote:x.quoteToken,liquidity:x.liquidity?.usd,volume:x.volume,change:x.priceChange,pairCreatedAt:x.pairCreatedAt,fdv:x.fdv}))}));
}

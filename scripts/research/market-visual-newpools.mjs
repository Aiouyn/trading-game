const now=Date.now();
for(let page=1;page<=8;page++) {
 const j=await (await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=${page}`,{headers:{accept:'application/json;version=20230302'}})).json();
 const arr=(j.data||[]).map(x=>({address:x.attributes.address,name:x.attributes.name,created:x.attributes.pool_created_at,ageHours:(now-Date.parse(x.attributes.pool_created_at))/3600000,reserve:+x.attributes.reserve_in_usd,volume:+x.attributes.volume_usd?.h24,change:+x.attributes.price_change_percentage?.h24,url:`https://www.geckoterminal.com/solana/pools/${x.attributes.address}`}));
 console.log(JSON.stringify({page,n:arr.length,items:arr.slice(0,6)}));
}

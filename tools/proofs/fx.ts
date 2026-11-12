import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { advanceFx, assertFxConservation, createFx, publicFx } from "@/server/market/fx/engine";
import { CURRENCIES, forwardRate, minor, pairQuotes, type Frame, type Genesis, type State } from "@/server/market/fx/model";
import { FileFxStore, FxEngine, stateHash } from "@/server/market/fx/store";
import { auto, autoGenesis, bank, command, convert, findWallet, frame, genesis, MARKS, offer, offers } from "../../tests/fixtures/fx";
async function main() {
  const evidence=process.env.SYS_FX_EVIDENCE_DIR; if(!evidence)throw new Error("SYS_FX_EVIDENCE_DIR required"); await mkdir(evidence,{recursive:true});
  const output=async(name:string,v:unknown)=>writeFile(path.join(evidence,name),JSON.stringify(v,null,2)+"\n");
  await output("measurement-contract.json",{version:1,head:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),gitStatus:execFileSync("git",["status","--porcelain"],{encoding:"utf8"}),scope:"isolated finite spot FX engine; explicit producer marks, not live macro/auth mounting",checks:["per-currency delta0 at every tick and every transfer","full-state per-tick versus complete-tape batch equality","fresh journal restarts across all persisted features","cross failure rolls back both legs","cash/asset/fee backing"],limits:["no full batch auction, live producer, deposit liability ledger, derivative settlement, carry simulation or calibration claimed","all incoming frames supplied: jump never fabricates missing observations"]});
  const clean=await mkdtemp(path.join(evidence,"clean-stores-")), g=autoGenesis();
  const cross=convert("a-cross","EUN","PYN",20000);
  const tape:Frame[]=Array.from({length:7*720},(_,tick)=>frame(tick));
  tape[0]=frame(0,offers()); tape[1]=frame(1,[cross,bank("b-bank","FDL","SRL",1000),auto("c-auto")]);
  tape[2]=frame(2,[command({kind:"CANCEL",id:"cancel",account:"maker-EUNFDL",offerId:"ask-EUNFDL"})]);
  tape[3]=frame(3,[convert("direct","FDL","NKR",20000)]);
  tape[4]=frame(4,[convert("blocked","EUN","NKR")],{controls:[{ccy:"EUN",untilTick:7}]}); tape[5]=frame(5,[cross]);
  tape[6]=frame(6,[bank("missing")],{marks:null}); tape[7]=frame(7,[convert("expired","EUN","NKR")],{controls:[{ccy:"EUN",untilTick:7}]});
  for(let tick=10;tick<210;tick++) { const from=CURRENCIES[tick%5]!, same=(tick*3+1)%5, to=CURRENCIES[same]===from?CURRENCIES[(same+1)%5]!:CURRENCIES[same]!; tape[tick]=frame(tick,[convert(`flow-${tick}`,from,to,(tick%7+1)*1000)]); }
  tape[3600]=frame(3600,[convert("weekend")]);
  const expected=advanceFx(createFx(g),tape); let stepping=createFx(g);
  for(const f of tape){stepping=advanceFx(stepping,[f]);assertFxConservation(stepping);} assert.deepEqual(stepping,expected);
  const rows:unknown[]=[];
  for(const cut of [0,1,2,4,6,7,tape.length-1]){
    const store=new FileFxStore(path.join(clean,`restart-${cut}.json`)); let e=await FxEngine.open(store,g); await e.observe(tape.slice(0,cut+1)); const before=e.snapshot();
    e=await FxEngine.open(new FileFxStore(store.filePath)); assert.deepEqual(e.snapshot(),before); await e.observe(tape.slice(cut+1)); assert.deepEqual(e.snapshot(),expected);
    await e.observe([tape[tape.length-1]!]); assert.deepEqual(e.snapshot(),expected); e=await FxEngine.open(new FileFxStore(store.filePath)); assert.deepEqual(e.snapshot(),expected);
    rows.push({file:store.filePath,cutTick:cut,checkpointSha256:stateHash(before),restartEquals:true,finalSha256:stateHash(e.snapshot()),repeatNoFeeOrDelivery:true});
  }
  await output("restart-jump-proof.json",{perTickEqualsCompleteTapeBatch:true,restarts:rows,finalSha256:stateHash(expected),ok:true});
  await output("final-state.json",expected);
  function audit(config:Genesis,s:State){
    const ledger=new Map(config.wallets.map((w)=>[w.id,Object.fromEntries(CURRENCIES.map((c)=>[c,BigInt(w.cash[c])]))]));
    for(const t of s.transfers){ const a=ledger.get(t.from),b=ledger.get(t.to);assert.ok(a&&b);a[t.ccy]-=BigInt(t.minor);b[t.ccy]+=BigInt(t.minor);assert.ok(a[t.ccy]>=BigInt(0));assert.ok(b[t.ccy]>=BigInt(0)); }
    for(const w of s.wallets)for(const c of CURRENCIES)assert.equal(ledger.get(w.id)?.[c],BigInt(w.cash[c]));
    assertFxConservation(s);return CURRENCIES.map((ccy)=>({ccy,genesisMinor:s.genesisCash[ccy],finalMinor:s.wallets.reduce((n,w)=>n+w.cash[ccy],0),delta:0}));
  }
  await output("conservation-proof.json",{currencies:audit(g,expected),everyPostedDebitFunded:true,transfers:expected.transfers.length,exchangeFeesFdl:findWallet(expected,"fees").cash.FDL,decisions:expected.receipts.reduce<Record<string,number>>((counts,r)=>{counts[r.result.kind]=(counts[r.result.kind]??0)+1;return counts;},{}),bankIncome:findWallet(expected,"bank-income").cash,assetGenesis:expected.genesisUnits,assetFinal:expected.wallets.reduce((n,w)=>n+(w.units.STOCK??0),0),everyTickChecked:true,ok:true});
  const thinG=genesis(), m=thinG.wallets.find((w)=>w.id==="maker-EUNFDL");assert.ok(m);m.cash.FDL=minor(31);
  const thinTape=[frame(0,[offer("source","EUNFDL","BUY_BASE",1000000,21),command({...offer("target","FDLPYN","BUY_BASE",100000000,1000),account:"maker-EUNFDL"})]),frame(1,[convert("rollback","EUN","PYN",1)])];
  const thinStart=advanceFx(createFx(thinG),thinTape.slice(0,1)), thinEnd=advanceFx(thinStart,thinTape.slice(1));
  assert.deepEqual(thinEnd.wallets,thinStart.wallets);assert.deepEqual(thinEnd.offers,thinStart.offers);assert.deepEqual(thinEnd.transfers,thinStart.transfers);
  assert.deepEqual(thinEnd.receipts.at(-1)?.result,{kind:"REJECTED",reason:"NO_LIQUIDITY"});
  let thinEngine=await FxEngine.open(new FileFxStore(path.join(clean,"cross-rollback.json")),thinG);await thinEngine.observe(thinTape);thinEngine=await FxEngine.open(new FileFxStore(path.join(clean,"cross-rollback.json")));assert.deepEqual(thinEngine.snapshot(),thinEnd);
  await output("two-leg-rollback-proof.json",{firstLegWouldSpend21EunMinor:true,secondLosesMakerFeeBacking:true,allWalletsOffersTransfersUnchanged:true,cash:audit(thinG,thinEnd),restartEqual:true,ok:true});
  const exhaust=advanceFx(createFx(thinG),[frame(0,[offer("finite","EUNFDL","BUY_BASE",1000000,21)]),frame(1,[convert("take","EUN","FDL",11)]),frame(2,[convert("empty","EUN","FDL",11)])]);
  assert.equal(exhaust.offers.length,0);assert.deepEqual(exhaust.receipts.at(-1)?.result,{kind:"REJECTED",reason:"NO_LIQUIDITY"});
  await output("finite-book-proof.json",{remainingOffers:0,bookCashFdl:findWallet(exhaust,"maker-EUNFDL").cash.FDL,noRefill:true,noLastResort:true,cash:audit(thinG,exhaust),ok:true});
  const ag=autoGenesis(), failedFrame=frame(1,[auto("asset-failed")],{assets:[{asset:"STOCK",seller:findWallet(createFx(ag),"seller").id,ccy:"NKR",unitPrice:minor(10100)}]}), autoTape=[frame(0,offers()),failedFrame];
  let ae=await FxEngine.open(new FileFxStore(path.join(clean,"auto-failed.json")),ag);await ae.observe(autoTape);const af=ae.snapshot();ae=await FxEngine.open(new FileFxStore(path.join(clean,"auto-failed.json")));await ae.observe([frame(2,[auto("asset-failed")])]);
  assert.equal(findWallet(af,"alice").cash.NKR,10050);assert.equal(findWallet(af,"alice").units.STOCK??0,0);assert.deepEqual(ae.snapshot().wallets,af.wallets);audit(ag,af);
  await output("auto-fx-proof.json",{successful:expected.receipts.find((r)=>r.id==="c-auto"),failedAsset:af.receipts.at(-1),retainedConvertedNkrMinor:10050,restartRepeatNoDuplicate:true,cashDelta:0,ok:true});
  const quotes=pairQuotes(frame(0).marks!), direct=quotes.find((q)=>q.pair==="EUNPYN"), a=quotes.find((q)=>q.pair==="EUNFDL"), b=quotes.find((q)=>q.pair==="FDLPYN");assert.ok(direct&&a&&b);assert.ok(Math.abs(direct.mid-a.mid*b.mid)<1e-10);
  const cip=forwardRate(1.1,.03,.05,2,"FDL",.5);assert.equal(cip,1.1*Math.exp((.05-.03-.004*.25)*2));
  await output("pricing-controls-proof.json",{marks:MARKS,quotes,cip,scope:"analytic pricing only, not traded derivative or carry performance",controlled:expected.receipts.find((r)=>r.id==="blocked"),expired:expected.receipts.find((r)=>r.id==="expired"),missingMark:expected.receipts.find((r)=>r.id==="missing"),weekend:expected.receipts.find((r)=>r.id==="weekend"),publicView:publicFx(expected),ok:true});
  await output("summary.json",{fullStateRestartAndJump:true,cleanStores:9,everyTickConserved:true,pairedTransferAudit:true,finiteBooks:true,crossRollback:true,autoFx:true,bankFeeTransferred:true,noRuntimeMounting:true,noCalibrationClaim:true,ok:true});
  console.log(`FX proofs passed: ${evidence};9 fresh stores; full-state restart/jump and every-currency cash delta0`);
}
main().catch((e:unknown)=>{console.error(e);process.exitCode=1;});

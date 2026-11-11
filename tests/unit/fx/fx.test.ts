import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { advanceFx, assertFxConservation, createFx, previewFx, publicFx, reserved } from "@/server/market/fx/engine";
import { anchoredLog, canonical, forwardRate, minor, pairQuotes, parseCommand, parseFrame, parseGenesis, rate, units, object, type State } from "@/server/market/fx/model";
import { FileFxStore, FxEngine, readCheckpoint, type Checkpoint, type FxStore } from "@/server/market/fx/store";
import { auto, autoGenesis, bank, command, convert, findWallet, frame, genesis, MARKS, offer, offers, seeded } from "../../fixtures/fx";
const last = (s: State) => s.receipts.at(-1)?.result;
const economic = (s: State) => canonical({ wallets:s.wallets, offers:s.offers, transfers:s.transfers });
function actorCash(g: ReturnType<typeof genesis>, key: string) { const w=g.wallets.find((w)=>w.id===key); if(!w) throw new Error("FIXTURE"); return w; }

describe("FX canonical pairs and producer-boundary math", () => {
  it("derives ten correctly oriented pairs and no independent cross price", () => {
    const q = pairQuotes(frame(0).marks!); expect(q).toHaveLength(10); expect(q.filter((q)=>q.isLeg)).toHaveLength(4);
    const price = (pair:string) => q.find((q)=>q.pair===pair)!.mid;
    expect(price("EUNPYN")).toBeCloseTo(price("EUNFDL")*price("FDLPYN"),12);
    expect(price("NKRPYN")).toBeCloseTo(price("FDLPYN")/price("FDLNKR"),12);
    expect(q.find((q)=>q.pair==="EUNPYN")?.display).toBe("110.00"); expect(q.find((q)=>q.pair==="EUNFDL")?.display).toBe("1.1000");
  });
  it("uses exact CIP and40bp fear-squared basis only when FDL is quote", () => {
    expect(forwardRate(1.1,.03,.05,2,"FDL",.5)).toBe(1.1*Math.exp((.05-.03-.004*.25)*2));
    expect(forwardRate(2,.03,.05,2,"NKR",1)).toBe(2*Math.exp((.05-.03)*2));
    expect(()=>forwardRate(1,0,0,1,"FDL",2)).toThrow(); expect(()=>forwardRate(1,0,1000,1,"FDL",0)).toThrow("CIP_RANGE");
  });
  it("retains20GD half-life independently of elapsed-step size without changing money", () => {
    const x=Math.log(1.1), f=Math.log(1.3), stepped=anchoredLog(anchoredLog(x,f,7200),f,7200);
    expect(anchoredLog(x,f,14400)).toBeCloseTo((x+f)/2,15); expect(stepped).toBeCloseTo(anchoredLog(x,f,14400),15);
    const s=seeded(), next=advanceFx(s,[frame(1,[],{marks:{...frame(0).marks!,EUNFDL:rate(2200000)}})]); expect(next.wallets).toEqual(s.wallets);
  });
  it("rejects unknown shapes, unsafe units, prototype keys, malformed marks and duplicates", () => {
    expect(()=>parseCommand({...convert("bad"),want:1.5})).toThrow(); expect(()=>parseCommand({...convert("bad"),want:Number.MAX_SAFE_INTEGER+1})).toThrow();
    expect(()=>parseCommand({...convert("bad"),extra:true})).toThrow(); expect(()=>parseFrame({...frame(0),marks:{...MARKS,EUNFDL:0}})).toThrow();
    expect(()=>parseFrame({...frame(0),commands:[convert("same"),convert("same")]})).toThrow(); expect(()=>parseCommand({...auto("bad"),asset:"__proto__"})).toThrow();
    expect(()=>parseGenesis({...genesis(),wallets:[genesis().wallets[0],genesis().wallets[0]]})).toThrow();
  });
});

describe("funded offers, atomic legs and fees", () => {
  it("holds funded quote money; cancellation releases only the owner's hold", () => {
    const s=seeded(); expect(reserved(s,findWallet(s,"maker-EUNFDL").id,"EUN")).toBe(500000);
    const wrong=advanceFx(s,[frame(1,[command({kind:"CANCEL",id:"cancel-wrong",account:"alice",offerId:"ask-EUNFDL"})])]); expect(last(wrong)).toEqual({kind:"REJECTED",reason:"FORBIDDEN"});
    const next=advanceFx(s,[frame(1,[command({kind:"CANCEL",id:"cancel-own",account:"maker-EUNFDL",offerId:"ask-EUNFDL"})])]); expect(reserved(next,findWallet(s,"maker-EUNFDL").id,"EUN")).toBe(0); expect(next.wallets).toEqual(s.wallets);
    const over=advanceFx(s,[frame(1,[offer("oversubscribed","EUNFDL","SELL_BASE",1100000,500001)])]); expect(last(over)).toEqual({kind:"REJECTED",reason:"FUNDS"});
  });
  it.each([["FDL","EUN"],["EUN","FDL"],["FDL","PYN"],["PYN","FDL"],["FDL","SRL"],["SRL","FDL"]])("settles funded %s→%s with both sides' FDL fees and no creation", (from,to) => {
    const want=from==="PYN"?1000:10000, s=seeded(), next=advanceFx(s,[frame(1,[convert("direct",from,to,want)])]); expect(last(next)).toMatchObject({kind:"CONVERTED",from,to,output:want});
    expect(findWallet(next,"fees").cash.FDL).toBe(20); assertFxConservation(next);
  });
  it("charges0.3bp above the minimum, transferred rather than burned", () => {
    const s=seeded(), next=advanceFx(s,[frame(1,[convert("large","FDL","EUN",400000)])]);
    expect(last(next)).toMatchObject({kind:"CONVERTED",feeFdl:14}); expect(findWallet(next,"fees").cash.FDL).toBe(28); assertFxConservation(next);
  });
  it("links both cross legs; derived prices and actual cash include spreads and fees", () => {
    const s=seeded(), next=advanceFx(s,[frame(1,[convert("cross","EUN","NKR")])]); expect(last(next)).toMatchObject({kind:"CONVERTED",from:"EUN",to:"NKR",output:10000,fills:2,feeFdl:20});
    expect(findWallet(next,"fees").cash.FDL).toBe(40); assertFxConservation(next);
  });
  it("has no fabricated maker in empty, thin or exhausted books; FOK leaves every leg untouched", () => {
    const empty=advanceFx(createFx(genesis()),[frame(0)]), x=advanceFx(empty,[frame(1,[convert("empty","EUN","NKR")])]); expect(last(x)).toMatchObject({kind:"REJECTED",reason:"NO_LIQUIDITY"}); expect(economic(x)).toBe(economic(empty));
    const thin=advanceFx(createFx(genesis()),[frame(0,[offer("thin","EUNFDL","BUY_BASE",1098900,20),offer("target","FDLNKR","BUY_BASE",1998000)])]);
    const y=advanceFx(thin,[frame(1,[convert("thin-cross","EUN","NKR")])]); expect(last(y)).toMatchObject({kind:"REJECTED"}); expect(economic(y)).toBe(economic(thin));
  });
  it("enforces available source funds, limit and maker fee backing atomically", () => {
    const s=seeded(), limited=advanceFx(s,[frame(1,[convert("limit","EUN","NKR",10000,1)])]); expect(last(limited)).toEqual({kind:"REJECTED",reason:"LIMIT"}); expect(economic(limited)).toBe(economic(s));
    const g=genesis(); actorCash(g,"alice").cash.EUN=minor(0); const poor=seeded(g), no=advanceFx(poor,[frame(1,[convert("poor","EUN","NKR")])]); expect(last(no)).toEqual({kind:"REJECTED",reason:"FUNDS"}); expect(economic(no)).toBe(economic(poor));
    const feePoor=genesis(); actorCash(feePoor,"maker-EUNFDL").cash.FDL=minor(500000);
    const f=advanceFx(createFx(feePoor),[frame(0,[offer("no-fee-gap","EUNFDL","BUY_BASE",1100000)])]);
    expect(last(advanceFx(f,[frame(1,[convert("fee-poor","EUN","FDL")])]))).toEqual({kind:"REJECTED",reason:"NO_LIQUIDITY"});
  });
  it("uses price then posted tick then stable id, including multi-maker partial rows", () => {
    const o1=offer("b-old","EUNFDL","SELL_BASE",1200000,100), o2=command({...offer("a-new","EUNFDL","SELL_BASE",1200000,200),account:"bob"});
    let s=advanceFx(createFx(genesis()),[frame(0,[o1]),frame(1,[o2])]); s=advanceFx(s,[frame(2,[convert("multi","FDL","EUN",150)])]);
    expect(last(s)).toMatchObject({kind:"CONVERTED",fills:2,output:150}); expect(s.offers.find((o)=>o.id==="b-old")).toBeUndefined(); expect(s.offers.find((o)=>o.id==="a-new")?.remaining).toBe(150); assertFxConservation(s);
  });
  it("does not self-match or let a marked mid act as liquidity", () => {
    const s=advanceFx(createFx(genesis()),[frame(0,[command({...offer("self","EUNFDL","SELL_BASE",1100000),account:"alice"})])]);
    expect(last(advanceFx(s,[frame(1,[convert("no-self","FDL","EUN")])]))).toMatchObject({kind:"REJECTED",reason:"NO_LIQUIDITY"});
  });
  it("rolls back an already-applied first cross leg when the second loses fee backing", () => {
    const g=genesis(); actorCash(g,"maker-EUNFDL").cash.FDL=minor(31);
    const s=advanceFx(createFx(g),[frame(0,[offer("source","EUNFDL","BUY_BASE",1000000,21),command({...offer("target","FDLPYN","BUY_BASE",100000000,1000),account:"maker-EUNFDL"})])]);
    const next=advanceFx(s,[frame(1,[convert("rollback-after-first","EUN","PYN",1)])]); expect(last(next)).toEqual({kind:"REJECTED",reason:"NO_LIQUIDITY"}); expect(economic(next)).toBe(economic(s)); assertFxConservation(next);
  });
  it("cannot profit a well-funded uncrossed round trip after spread, rounding and both fees", () => {
    const g=genesis(), a=actorCash(g,"alice"); for(const c of ["EUN","NKR","PYN","SRL"] as const)a.cash[c]=minor(0);
    const s=seeded(g), bought=advanceFx(s,[frame(1,[convert("round-buy","FDL","EUN",10000)])]), sold=advanceFx(bought,[frame(2,[convert("round-sell","EUN","FDL",10979)])]);
    expect(last(sold)).toMatchObject({kind:"CONVERTED"}); expect(findWallet(sold,"alice").cash.EUN).toBe(0); expect(findWallet(sold,"alice").cash.FDL).toBeLessThan(findWallet(s,"alice").cash.FDL); assertFxConservation(sold);
  });
  it("rejects oversized derived amounts without publishing an unsafe balance", () => {
    const s=seeded(), next=advanceFx(s,[frame(1,[convert("huge","FDL","PYN",Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)])]);
    expect(last(next)?.kind).toBe("REJECTED"); expect(economic(next)).toBe(economic(s)); assertFxConservation(next);
  });
  it("preview is exact, read-only and public view never identifies holders/orders", () => {
    const s=seeded(), before=canonical(s), cmd=convert("preview","EUN","NKR"), p=previewFx(s,cmd);
    expect(canonical(s)).toBe(before); expect(last(advanceFx(s,[frame(1,[cmd])]))).toEqual(p);
    expect(canonical(publicFx(s))).not.toMatch(/alice|maker-|ask-|bid-|bank-income/);
  });
});

describe("current permissions, controls and bank conversion", () => {
  it("rechecks source/bridge controls and exact exclusive expiry without clamping marks", () => {
    const s=seeded(), f=frame(1,[convert("blocked","EUN","NKR")],{controls:[{ccy:"FDL",untilTick:2}]}), next=advanceFx(s,[f]);
    expect(last(next)).toEqual({kind:"REJECTED",reason:"CONTROLS"}); expect(economic(next)).toBe(economic(s)); expect(publicFx(next).marks).toEqual(pairQuotes(f.marks!));
    expect(last(advanceFx(next,[frame(2,[convert("expired","EUN","NKR")],{controls:f.controls})]))).toMatchObject({kind:"CONVERTED"});
  });
  it("rejects weekends and held/low-license actors, but lower-license retail is permitted", () => {
    const weekend=genesis(); weekend.startTick=5*720; const s=advanceFx(createFx(weekend),[frame(5*720,offers())]); expect(last(advanceFx(s,[frame(5*720+1,[convert("closed")])]))).toEqual({kind:"REJECTED",reason:"CLOSED"});
    for(const held of [true,false]){ const g=genesis(); actorCash(g,"alice").access={kind:"ACTOR",license:0,held}; const x=seeded(g), y=advanceFx(x,[frame(1,[convert("perm")])]); expect(last(y)).toEqual({kind:"REJECTED",reason:held?"HELD":"LICENSE"});
      expect(last(advanceFx(x,[frame(1,[bank("retail")])]))).toMatchObject(held?{kind:"REJECTED",reason:"HELD"}:{kind:"BANK_CONVERTED"}); }
  });
  it("credits exact0.25% bank margin to bank income with finite treasury backing", () => {
    const s=seeded(), next=advanceFx(s,[frame(1,[bank("bank")])]); expect(last(next)).toEqual({kind:"BANK_CONVERTED",from:"FDL",to:"NKR",input:10000,output:19950,bankMargin:50});
    expect(findWallet(next,"bank-income").cash.NKR).toBe(50); expect(findWallet(next,"bank").cash.NKR).toBe(980000); assertFxConservation(next);
    const g=genesis(); actorCash(g,"bank").cash.NKR=minor(0); const poor=seeded(g), no=advanceFx(poor,[frame(1,[bank("no-bank-funds")])]); expect(last(no)).toMatchObject({kind:"REJECTED",reason:"FUNDS"}); expect(economic(no)).toBe(economic(poor));
  });
  it("uses the exact positive bank ask margin, not the first-order output-fee approximation", () => {
    const s=seeded(), next=advanceFx(s,[frame(1,[bank("buy-base","NKR","EUN",1000000)])]);
    const net=Math.floor(1000000*5*10000/(11*10025)), gross=Math.floor(1000000*5/11);
    expect(last(next)).toEqual({kind:"BANK_CONVERTED",from:"NKR",to:"EUN",input:1000000,output:net,bankMargin:gross-net});
    expect(findWallet(next,"bank-income").cash.EUN).toBe(gross-net); assertFxConservation(next);
  });
  it("never substitutes equity prices for missing FX marks", () => {
    const s=seeded(); expect(last(advanceFx(s,[frame(1,[bank("missing")],{marks:null})]))).toEqual({kind:"REJECTED",reason:"NO_MARK"});
    expect(publicFx(advanceFx(s,[frame(1,[],{marks:null})])).marks).toBeNull();
  });
});

describe("FX before finite asset delivery", () => {
  it("converts estimate plus0.5%, reserves it, delivers once and retains unused target cash", () => {
    const s=seeded(autoGenesis()), next=advanceFx(s,[frame(1,[auto("a-auto"),convert("z-steal","NKR","FDL",100)])]);
    expect(next.receipts.find((r)=>r.id==="a-auto")?.result).toMatchObject({kind:"AUTO",fx:{kind:"CONVERTED",output:10050},asset:{kind:"FILLED",qty:1,paid:10000}});
    expect(next.receipts.find((r)=>r.id==="z-steal")?.result).toEqual({kind:"REJECTED",reason:"FUNDS"}); expect(findWallet(next,"alice").cash.NKR).toBe(50); expect(findWallet(next,"alice").units.STOCK).toBe(1); expect(next.reservations).toEqual([]); assertFxConservation(next);
  });
  it("FX failure cancels asset with FX_LEG_FAILED and changes neither leg", () => {
    const s=seeded(autoGenesis()), next=advanceFx(s,[frame(1,[auto("auto-fail")],{controls:[{ccy:"EUN",untilTick:2}]})]);
    expect(last(next)).toMatchObject({kind:"AUTO",asset:{kind:"CANCELLED",reason:"FX_LEG_FAILED"}}); expect(economic(next)).toBe(economic(s));
  });
  it("asset stock or price failure retains successful FX (no rollback/refund faucet)", () => {
    for(const price of [10000,10100]){ const g=autoGenesis(); if(price===10000)actorCash(g,"seller").units.STOCK=units(0); const s=seeded(g), next=advanceFx(s,[frame(1,[auto("asset-fail")],{assets:[{asset:"STOCK",seller:findWallet(s,"seller").id,ccy:"NKR",unitPrice:minor(price)}]})]);
      expect(last(next)).toMatchObject({kind:"AUTO",fx:{kind:"CONVERTED"},asset:{kind:"CANCELLED",reason:price===10000?"ASSET_UNAVAILABLE":"LIMIT"}}); expect(findWallet(next,"alice").cash.NKR).toBe(10050); expect(findWallet(next,"alice").units.STOCK??0).toBe(0); assertFxConservation(next); }
  });
  it("can use existing target funds without converting again and replay never duplicates units", () => {
    const s=seeded(), cmd=auto("existing"), f=frame(1,[cmd]), next=advanceFx(s,[f]); expect(last(next)).toMatchObject({kind:"AUTO",fx:{kind:"NOT_NEEDED"},asset:{kind:"FILLED"}});
    expect(advanceFx(next,[f])).toEqual(next); const retried=advanceFx(next,[frame(2,[cmd])]); expect(retried.wallets).toEqual(next.wallets); expect(retried.receipts).toEqual(next.receipts);
  });
});

describe("durable journal and deterministic replay", () => {
  it("fresh file restart and whole-tape jump equal per-tick full state including holds, fees and asset units", async () => {
    const g=autoGenesis(), tape=[frame(0,offers()),frame(1,[convert("cross","EUN","SRL"),bank("retail"),auto("buy")]),...Array.from({length:40},(_,i)=>frame(i+2))];
    const expected=advanceFx(createFx(g),tape); let stepped=createFx(g); for(const f of tape){stepped=advanceFx(stepped,[f]);assertFxConservation(stepped);} expect(stepped).toEqual(expected);
    const dir=await mkdtemp(path.join(tmpdir(),"sys-fx-test-")), store=new FileFxStore(path.join(dir,"fx.json")); let e=await FxEngine.open(store,g); await e.observe(tape.slice(0,2)); e=await FxEngine.open(new FileFxStore(store.filePath)); await e.observe(tape.slice(2)); expect(e.snapshot()).toEqual(expected);
    await e.observe([tape.at(-1)!]); expect(e.snapshot()).toEqual(expected); expect(readCheckpoint(await store.load()).state).toEqual(expected);
  });
  it("save failure leaves state unchanged, copies queued inputs and serializes writers", async () => {
    let saved:Checkpoint|null=null, fail=false; const store:FxStore={load:async()=>saved,save:async(c)=>{if(fail)throw new Error("disk full");saved=structuredClone(c);}};
    const e=await FxEngine.open(store,genesis()), before=e.snapshot(); fail=true; await expect(e.observe([frame(0,offers())])).rejects.toThrow("disk full"); expect(e.snapshot()).toEqual(before);
    fail=false; const f=frame(0,offers()), p=e.observe([f]); f.commands.length=0; await p; expect(e.snapshot().offers).toHaveLength(8); await Promise.all([e.observe([frame(1)]),e.observe([frame(2)])]); expect(e.snapshot().tick).toBe(2);
  });
  it.each(['null','{"v":99}','{"v":1,"frames":[],"genesis":{},"stateSha256":"bad"}'])("rejects and preserves corrupt existing file %s",async(text)=>{
    const dir=await mkdtemp(path.join(tmpdir(),"sys-fx-corrupt-")), file=path.join(dir,"fx.json"); await writeFile(file,text); await expect(FxEngine.open(new FileFxStore(file),genesis())).rejects.toThrow(); expect(await readFile(file,"utf8")).toBe(text);
  });
  it("rejects changed genesis, hash corruption, gaps, epochs and conflicting idempotency without caller mutation", async () => {
    let saved:Checkpoint|null=null; const store:FxStore={load:async()=>saved,save:async(c)=>{saved=structuredClone(c);}}; const e=await FxEngine.open(store,genesis()); await e.observe([frame(0,offers())]); const s=e.snapshot(), before=canonical(s);
    await expect(FxEngine.open(store,{...genesis(),epoch:"other"})).rejects.toThrow("FX_GENESIS_MISMATCH");
    const raw=await store.load(); if(!object(raw))throw new Error("FIXTURE_CHECKPOINT"); expect(()=>readCheckpoint({...raw,stateSha256:"0".repeat(64)})).toThrow("FX_CHECKPOINT_HASH");
    expect(()=>advanceFx(s,[frame(2)])).toThrow("FX_TICK_GAP"); expect(()=>advanceFx(s,[frame(1,[],{epoch:"new"})])).toThrow("FX_EPOCH_MISMATCH"); expect(()=>advanceFx(s,[frame(0)])).toThrow("FX_FRAME_CONFLICT");
    const decided=advanceFx(s,[frame(1,[convert("key")])]); expect(()=>advanceFx(decided,[frame(2,[convert("key","FDL","NKR",20000)])])).toThrow("FX_IDEMPOTENCY_CONFLICT"); expect(canonical(s)).toBe(before);
  });
  it("complete week tape survives a batch jump and closes the weekend without money drift",()=>{
    const tape=Array.from({length:7*720},(_,tick)=>frame(tick,tick===0?offers():tick===3600?[convert("weekend")]:[])); const expected=advanceFx(createFx(genesis()),tape); let s=createFx(genesis()); for(const f of tape)s=advanceFx(s,[f]); expect(s).toEqual(expected); expect(last(s)).toEqual({kind:"REJECTED",reason:"CLOSED"}); assertFxConservation(s);
  });
});

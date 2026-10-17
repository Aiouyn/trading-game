# Flow measurement: works on any trades frame with cols mint,t,is_buy,sol,tok,wallet,mc (mcap in SOL)
import numpy as np, pandas as pd, json, sys
AGE_BINS=[0,1,2,5,10,30,60,180,600,1e9]   # minutes
PK_BINS=[-60,-30,-10,-5,-2,0,2,5,10,30,60,180]
DD_BINS=[0,.1,.3,.5,.7,.9,1.01]
def hill(x,frac=.05):
    x=np.sort(x[x>0])[::-1]; k=max(int(len(x)*frac),10)
    if len(x)<k+1: return float('nan')
    return float(1/np.mean(np.log(x[:k]/x[k])))
def classify(d,mc0):
    pm=d.mc.max()/mc0; grad=d.mc.max()>=GRAD_MC; t_end=d.t.max()
    dev=d.wallet.iloc[0]; dv=d[d.wallet==dev]; devbuy=dv[dv.is_buy].tok.sum()
    dsell=dv[~dv.is_buy]; t_ds=dsell.t.iloc[0] if len(dsell) else None
    devsold=dsell.tok.sum()/max(devbuy,1e-9) if devbuy>0 else 0
    endr=d.mc.iloc[-1]/d.mc.max()
    if grad: c='runner'
    elif devsold>.5 and t_ds is not None and t_ds<600 and endr<.4 and pm<4: c='rug'
    elif pm<5: c='quick_death'
    else: c='grinder_trender'
    return c,dict(pm=float(pm),grad=bool(grad),dev_sold_frac=float(min(devsold,1.5)),dev_first_sell_s=None if t_ds is None else float(t_ds),life_min=float(t_end/60))
GRAD_MC=400.0
def per_coin(d):
    d=d.sort_values('t'); mc0=d.mc.iloc[0]; cls,info=classify(d,mc0)
    tm=d.t.values/60; buys=d[d.is_buy]
    first=buys.groupby('wallet').t.min()/60
    tpk=d.t.values[np.argmax(d.mc.values)]/60
    life=tm.max()
    arr_age=[]; 
    for a,b in zip(AGE_BINS[:-1],AGE_BINS[1:]):
        if life<a: arr_age.append(None); continue
        span=min(b,life)-a; n=((first>=a)&(first<b)).sum(); arr_age.append(float(n/max(span,.25)))
    rel=first-tpk; arr_pk=[]
    for a,b in zip(PK_BINS[:-1],PK_BINS[1:]):
        if tpk+a<0 or tpk+a>life: arr_pk.append(None); continue
        arr_pk.append(float(((rel>=a)&(rel<b)).sum()/(b-a)))
    # repeat share
    nb=buys.groupby('wallet').size(); rep=float((nb>1).sum()/max(len(nb),1)); rep_buys=float((nb[nb>1].sum()-(nb>1).sum())/max(nb.sum(),1))
    # holding: exit = first time net tokens <=10% of max held
    holds=[]; never=0; nw=0
    for w,g in d.groupby('wallet',sort=False):
        if not g.is_buy.any(): continue
        nw+=1; net=np.cumsum(np.where(g.is_buy,g.tok,-g.tok)); mx=np.maximum.accumulate(net)
        tb=g.t[g.is_buy].iloc[0]; ex=np.where((~g.is_buy.values)&(net<=.1*mx))[0]
        if len(ex): holds.append((g.t.values[ex[0]]-tb)/60)
        else: never+=1
    sells=d[~d.is_buy].t.values; ia=np.diff(sells)
    burst=float((ia.std()-ia.mean())/(ia.std()+ia.mean())) if len(ia)>5 else None
    # drawdown sells/min & buys/min (5s grid aggregated per minute)
    ath=np.maximum.accumulate(d.mc.values); dd=1-d.mc.values/ath
    mi=(d.t.values//60).astype(int); L=mi.max()+1
    mdd=pd.Series(dd).groupby(mi).last().reindex(range(L)).ffill().values
    ns=np.bincount(mi[~d.is_buy.values],minlength=L); nbm=np.bincount(mi[d.is_buy.values],minlength=L)
    ddb=np.digitize(mdd,DD_BINS)-1
    ddS=[[float(ns[ddb==k].sum()),float(nbm[ddb==k].sum()),int((ddb==k).sum())] for k in range(len(DD_BINS)-1)]
    # big candles: 1-min, log ret of last price
    px=pd.Series(d.mc.values).groupby(mi).last().reindex(range(L)).ffill().values
    r=np.r_[0,np.diff(np.log(px))]; act=(ns+nbm)>0
    resp=dict(up=[],dn=[])
    if act.sum()>=20:
        thr=np.quantile(np.abs(r[act]),.95)
        for i in np.where(act&(np.abs(r)>=thr)&(np.abs(r)>0))[0]:
            if i<1 or i+10>=L: continue
            pre=(ns[max(0,i-10):i].sum()+nbm[max(0,i-10):i].sum())/max(min(10,i),1)+.1
            resp['up' if r[i]>0 else 'dn'].append(dict(b=(nbm[i+1:i+11]/pre).tolist(),s=(ns[i+1:i+11]/pre).tolist()))
    dev=d.wallet.iloc[0]
    return cls,dict(info=info,n=len(d),arr_age=arr_age,arr_pk=arr_pk,rep_wallet=rep,rep_buys=rep_buys,
        buy_sol=buys.sol.values,buy_mcx=(buys.mc.values/mc0),buy_age=buys.t.values/60,holds=np.array(holds),never=never/max(nw,1),
        burst=burst,ia=ia,ddS=ddS,resp=resp,uniq=len(nb))
def q(x,qs=(.1,.25,.5,.75,.9,.99)): x=np.asarray(x); return [float(np.quantile(x,v)) for v in qs] if len(x) else None
def nanmean_lists(L):
    A=np.array([[np.nan if v is None else v for v in l] for l in L],float)
    return [None if np.all(np.isnan(c)) else float(np.nanmean(c)) for c in A.T], [int((~np.isnan(c)).sum()) for c in A.T]
def pool(items):
    out={}; out['n_coins']=len(items)
    out['arr_age'],out['arr_age_n']=nanmean_lists([x['arr_age'] for x in items])
    out['arr_pk'],out['arr_pk_n']=nanmean_lists([x['arr_pk'] for x in items])
    bs=np.concatenate([x['buy_sol'] for x in items]); ba=np.concatenate([x['buy_age'] for x in items]); bm=np.concatenate([x['buy_mcx'] for x in items])
    out['buy_q']=q(bs); out['buy_hill']=hill(bs); out['buy_mean']=float(bs.mean())
    out['buy_q50_by_age']={f'{a}-{b}':(float(np.median(bs[(ba>=a)&(ba<b)])) if ((ba>=a)&(ba<b)).sum()>20 else None) for a,b in zip(AGE_BINS[:-1],AGE_BINS[1:])}
    out['buy_q90_by_mcx']={f'{a}-{b}':(float(np.quantile(bs[(bm>=a)&(bm<b)],.9)) if ((bm>=a)&(bm<b)).sum()>20 else None) for a,b in [(0,1.5),(1.5,3),(3,6),(6,15),(15,1e9)]}
    out['buy_q50_by_mcx']={f'{a}-{b}':(float(np.median(bs[(bm>=a)&(bm<b)])) if ((bm>=a)&(bm<b)).sum()>20 else None) for a,b in [(0,1.5),(1.5,3),(3,6),(6,15),(15,1e9)]}
    h=np.concatenate([x['holds'] for x in items]); out['hold_q_min']=q(h); out['never_sell']=float(np.mean([x['never'] for x in items]))
    ia=np.concatenate([x['ia'] for x in items]); out['sell_ia_q_s']=q(ia)
    b=[x['burst'] for x in items if x['burst'] is not None]; out['burst_med']=float(np.median(b)) if b else None
    S=np.array([x['ddS'] for x in items]).sum(0); out['dd_sells_per_min']=[float(s/max(m,1)) for s,_,m in S]; out['dd_buys_per_min']=[float(b_/max(m,1)) for _,b_,m in S]
    out['dd_sell_share']=[float(s/max(s+b_,1)) for s,b_,_ in S]
    for k in ('up','dn'):
        R=[e for x in items for e in x['resp'][k]]
        out['bigc_'+k+'_n']=len(R)
        if R: out['bigc_'+k+'_buys']=np.mean([e['b'] for e in R],0).round(3).tolist(); out['bigc_'+k+'_sells']=np.mean([e['s'] for e in R],0).round(3).tolist()
    out['rep_wallet']=float(np.mean([x['rep_wallet'] for x in items])); out['rep_buys']=float(np.mean([x['rep_buys'] for x in items]))
    info=[x['info'] for x in items]
    out['dev_sold_any']=float(np.mean([i['dev_first_sell_s'] is not None for i in info]))
    ds=[i['dev_first_sell_s']/60 for i in info if i['dev_first_sell_s'] is not None]; out['dev_first_sell_q_min']=q(ds,(.25,.5,.75))
    out['life_q_min']=q([i['life_min'] for i in info],(.25,.5,.75,.9)); out['peak_mult_q']=q([i['pm'] for i in info],(.25,.5,.75,.9))
    return out
def run(df,minN=50):
    res={}; per={}
    for m,d in df.groupby('mint',sort=False):
        if len(d)<minN: continue
        c,x=per_coin(d); res.setdefault(c,[]).append(x); per[m]=(c,x)
    J={'classes':{c:pool(v) for c,v in res.items()}}; J['classes']['ALL']=pool([x for v in res.values() for x in v])
    J['per_coin']={m:dict(cls=c,**x['info'],n=x['n'],uniq=x['uniq'],buy_q50=float(np.median(x['buy_sol'])),buy_hill=hill(x['buy_sol']),hold_q50=float(np.median(x['holds'])) if len(x['holds']) else None,never=x['never'],burst=x['burst'],rep=x['rep_wallet'],arr_age=x['arr_age']) for m,(c,x) in per.items()}
    return J

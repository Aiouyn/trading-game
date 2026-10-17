'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { t, useLocale } from '@/i18n';
import { useGame } from '@/game/store';
import { openFromShell } from '@/components/os/openApp';
import { bindPrivatePlaces } from './bindings';
import { useCityVisit } from './navigation';
import { clampZoom, MIN_ELEVATION, MAX_ELEVATION } from './camera';
import { CITY_IDS, type CityId, type CityScene, type CityView, type PrivatePlace } from './types';
import './city.css';

const CityCanvas=dynamic(()=>import('./CityCanvas'),{ssr:false,loading:()=> <div className="city-loading">{t('city.loading')}</div>});
const INITIAL:CityView={rotation:0,zoom:1.12,night:false,overlay:'places',stage:'settled',selected:null,focus:null,reveal:false,elevation:MIN_ELEVATION};
const cache=new Map<CityId,CityScene>();
const cityNames=['Port Avalon','Nordhaven City','Meridia','Sundara Coast','Kaiyo City','Isla Serena'];

export function CityApp({preview=false,active=true}:{preview?:boolean;active?:boolean}) {
  useLocale(s=>s.locale);
  const [cityId,setCityId]=useState<CityId>('avalon');
  const [scene,setScene]=useState<CityScene|null>(null);
  const [error,setError]=useState(false);
  const [view,setView]=useState(INITIAL);
  const [query,setQuery]=useState('');
  const [directory,setDirectory]=useState(false);
  const [retry,setRetry]=useState(0);
  const config=useGame(s=>s.config);
  const frame=useGame(s=>s.frame);
  const me=useGame(s=>s.me);
  const setSelected=useGame(s=>s.select);
  const requestedVisit=useCityVisit(s=>s.request);
  useEffect(()=>{
    const abort=new AbortController();
    const existing=cache.get(cityId);
    const load=async()=>{
      try{
        const response=await fetch('/api/cities/'+cityId+'?v=terrain-2',{signal:abort.signal});
        if(!response.ok)throw new Error('city');
        const data=await response.json() as CityScene;
        if(abort.signal.aborted)return;
        cache.set(cityId,data);setScene(data);setError(false);
      }catch(e){if((e as Error).name!=='AbortError')setError(true);}
    };
    if(existing){Promise.resolve().then(()=>{if(!abort.signal.aborted){setScene(existing);setError(false);}});}
    else void load();
    return ()=>abort.abort();
  },[cityId,retry]);
  const current=scene?.id===cityId?scene:null;
  const privatePlaces=useMemo<PrivatePlace[]>(()=>[
    ...(me?.businesses??[]).map(b=>({id:b.id,name:b.name,cityId:b.cityId,kind:'business' as const})),
    ...(me?.properties??[]).map(p=>({id:p.id,name:t('city.property'),cityId:p.cityId,districtId:p.districtId,kind:'property' as const})),
  ],[me]);
  const places=useMemo(()=>current?bindPrivatePlaces(current,privatePlaces):[],[current,privatePlaces]);
  const owned=useMemo(()=>places.map(p=>p.buildingId),[places]);
  useEffect(()=>{
    if(!requestedVisit)return;
    Promise.resolve().then(()=>{
      if(useCityVisit.getState().request!==requestedVisit)return;
      if(cityId!==requestedVisit.cityId){setCityId(requestedVisit.cityId);setView(INITIAL);return;}
      if(!current)return;
      const place=places.find(p=>p.id===requestedVisit.placeId);
      if(place)setView(v=>({...v,selected:place.buildingId,focus:place.buildingId,zoom:2.1,reveal:true}));
      useCityVisit.setState({request:null});
    });
  },[requestedVisit,cityId,current,places]);
  const quotes=useMemo(()=>{
    const result:Record<string,number>={};
    if(!frame||frame.cfgSeq!==useGame.getState().cfgSeq)return result;
    config.assets.forEach((a,i)=>{
      const f=frame.assets[i];if(f)result[a.id]=Math.exp(f[0]-f[3])-1;
    });return result;
  },[config,frame]);
  const onSelect=useCallback((selected:string|null)=>setView(v=>({...v,selected})),[]);
  const onZoom=useCallback((delta:number)=>setView(v=>({...v,zoom:clampZoom(v.zoom+delta)})),[]);
  const onOrbit=useCallback((yaw:number,tilt:number)=>setView(v=>({...v,rotation:v.rotation+yaw/(Math.PI/2),elevation:Math.max(MIN_ELEVATION,Math.min(MAX_ELEVATION,v.elevation+tilt))})),[]);
  const visit=(id:string)=>setView(v=>({...v,selected:id,focus:id,zoom:2.1,reveal:false}));
  const selected=current?.buildings.find(b=>b.id===view.selected);
  const selectedPlaces=places.filter(p=>p.buildingId===selected?.id);
  const matches=current?.buildings.filter(b=>b.kind==='hq'||b.kind==='landmark'||owned.includes(b.id))
    .filter(b=>!query||[b.name,b.company?.id,b.address,...places.filter(p=>p.buildingId===b.id).map(p=>p.name)].join(' ').toLowerCase().includes(query.toLowerCase()))??[];
  const chooseCity=(id:CityId)=>{setCityId(id);setView(INITIAL);setQuery('');};
  const openCompany=(id:string)=>{setSelected(id);openFromShell('broker',{ticker:id});};
  return <section className={'city-app'+(preview?' city-standalone':'')} data-testid="city-app" data-city={cityId}>
    <header className="city-header">
      <div><p className="city-eyebrow">{t('city.eyebrow')}</p><h1>{cityNames[CITY_IDS.indexOf(cityId)]}</h1></div>
      <div className="city-header-actions">
        {preview&&<Link href="/">{t('city.enterGame')} ↗</Link>}
        <button onClick={()=>setView(v=>({...v,night:!v.night}))} aria-pressed={view.night} data-testid="city-night">{view.night?'☾':'☀'} <span>{t(view.night?'city.night':'city.day')}</span></button>
      </div>
    </header>
    <nav className="city-tabs" aria-label={t('city.choose')}>
      {CITY_IDS.map((id,i)=><button key={id} aria-pressed={id===cityId} onClick={()=>chooseCity(id)} data-testid={'city-tab-'+id}><span className="city-tab-number">0{i+1}</span>{cityNames[i]}</button>)}
    </nav>
    <div className="city-main">
      <aside className={'city-sidebar'+(directory?' city-directory-open':'')}>
        <div className="city-sidebar-heading"><p className="city-eyebrow">{t('city.atlas')}</p><button className="city-mobile-close" onClick={()=>setDirectory(false)} aria-label={t('city.close')}>×</button></div>
        <h2>{t('city.placeInWorld')}</h2>
        <p className="city-intro">{t('city.intro.'+cityId)}</p>
        <div className="city-legend">
          <span><i className="city-dot"/> {t('city.publicCompanies')}</span>
          <span><i className="city-dot city-dot-brass"/> {t('city.myPlaces')}</span>
        </div>
        <div className="city-stat-row"><div><strong>{current?.buildings.length.toLocaleString()??'—'}</strong><span>{t('city.buildings')}</span></div><div><strong>{current?.buildings.filter(b=>b.kind==='hq').length??'—'}</strong><span>{t('city.headquarters')}</span></div></div>
        <div className="city-section-title"><h3>{t('city.districts')}</h3><span>{t(frame?'city.live':'city.reference')}</span></div>
        <div className="city-districts">{current?.districts.map((d,i)=>{
          const idx='RE.'+cityId+'.'+d.id;
          const assetIndex=config.assets.findIndex(a=>a.id===idx);
          const price=frame&&frame.cfgSeq===useGame.getState().cfgSeq&&assetIndex>=0&&frame.assets[assetIndex]?Math.exp(frame.assets[assetIndex][0]):null;
          const landmark=current.buildings.find(b=>b.district===d.id&&b.kind==='landmark');
          return <button key={d.id} onClick={()=>landmark&&visit(landmark.id)}><span className={'city-district-icon city-district-'+i}/><span><strong>{d.name}</strong><small>{d.blurb}</small></span><b>{price!==null?price.toFixed(1):'—'}</b></button>;
        })}</div>
        <div className="city-section-title"><h3>{t('city.myPlaces')}</h3><span>{places.length}</span></div>
        {places.length? <div className="city-owned">{places.map(p=><button key={p.id} onClick={()=>visit(p.buildingId)}><strong>{p.name}</strong><small>{p.address}</small><span>↗</span></button>)}</div>:<p className="city-empty">{t('city.noPlaces')}</p>}
        <div className="city-section-title"><h3>{t('city.directory')}</h3><span>{matches.length}</span></div>
        <input aria-label={t('city.search')} placeholder={t('city.search')} value={query} onChange={e=>setQuery(e.target.value)} data-testid="city-search"/>
        <div className="city-directory">{matches.map(b=><button key={b.id} onClick={()=>visit(b.id)} data-testid={'city-building-'+(b.company?.id??b.id)}><span>{b.company?.id??'◇'}</span><strong>{b.name}</strong><span>↗</span></button>)}</div>
      </aside>
      <div className="city-map-wrap">
        {current?<CityCanvas scene={current} view={view} owned={owned} quotes={quotes} active={active} onSelect={onSelect} onZoom={onZoom} onOrbit={onOrbit}/>:<div className="city-loading">{error?<><p>{t('city.error')}</p><button onClick={()=>{setError(false);setRetry(n=>n+1);}}>{t('city.retry')}</button></>:t('city.loading')}</div>}
        <div className="city-map-top">
          <div className="city-view-tabs" aria-label={t('city.overlays')}>
            {(['places','districts','market'] as const).map(overlay=><button key={overlay} onClick={()=>setView(v=>({...v,overlay}))} aria-pressed={view.overlay===overlay} disabled={overlay==='market'&&!frame}>{t('city.overlay.'+overlay)}</button>)}
          </div>
          <button className="city-directory-toggle" onClick={()=>setDirectory(v=>!v)} aria-expanded={directory}>{t('city.directory')} ☰</button>
        </div>
        <div className="city-compass"><span>N</span><div style={{transform:'rotate('+(-view.rotation*90)+'deg)'}}>↑</div><small>{t('city.view')}</small></div>
        <div className="city-tour">{current?.viewpoints.map(p=><button key={p.id} data-testid={'city-tour-'+p.id} onClick={()=>setView(v=>({...v,focus:'view:'+p.id,selected:null,zoom:1.12,reveal:false}))}>{t(p.key)}</button>)}</div>
        <div className="city-map-title" aria-hidden><span>{t('city.cityOf')}</span><strong>{cityNames[CITY_IDS.indexOf(cityId)]}</strong><small>{t('city.mapSubtitle')}</small></div>
        {selected&&<article className="city-selection" data-testid="city-selection">
          <button className="city-selection-close" onClick={()=>setView(v=>({...v,selected:null}))} aria-label={t('city.close')}>×</button>
          <p className="city-eyebrow">{selected.company?.id??t('city.kind.'+selected.kind)}</p>
          <h2>{selectedPlaces[0]?.name??selected.name}</h2><p>{selectedPlaces[0]?.address??selected.address}</p>
          <div className="city-selection-meta"><span>{t('city.floors',{count:Math.round(selected.h/3.8)})}</span><span>{current?.districts.find(d=>d.id===selected.district)?.name}</span>{selected.company&&quotes[selected.company.id]!==undefined&&<b>{(quotes[selected.company.id]*100).toFixed(2)}% {t('city.today')}</b>}</div>
          <button className="city-reveal" data-testid="city-reveal" aria-pressed={view.reveal} onClick={()=>setView(v=>({...v,reveal:!v.reveal}))}>{t(view.reveal?'city.restoreNeighbors':'city.revealBuilding')}</button>
          {selected.company&&!preview&&<button className="city-primary" onClick={()=>openCompany(selected.company!.id)}>{t('city.openBroker')} ↗</button>}
          {selectedPlaces.length>0&&!preview&&<button className="city-primary" onClick={()=>openFromShell('businesses',{view:selectedPlaces[0].kind==='business'?'owned':'homes'})}>{t('city.manage')} ↗</button>}
          {preview&&<small className="city-preview-note">{t('city.referenceScene')}</small>}
        </article>}
        <div className="city-map-bottom">
          <div className="city-map-help">{t('city.help')}</div>
          <div className="city-camera">
            <button aria-label={t('city.rotateLeft')} onClick={()=>setView(v=>({...v,rotation:(v.rotation+3)%4}))} data-testid="city-rotate">↶</button>
            <button aria-label={t('city.zoomOut')} onClick={()=>onZoom(-0.25)}>−</button>
            <span>{Math.round(view.zoom*100)}%</span>
            <button aria-label={t('city.zoomIn')} onClick={()=>onZoom(0.25)}>+</button>
            <button aria-label={t('city.rotateRight')} onClick={()=>setView(v=>({...v,rotation:(v.rotation+1)%4}))}>↷</button>
            <button aria-label={t('city.reset')} onClick={()=>setView(v=>({...INITIAL,night:v.night,overlay:v.overlay,stage:v.stage}))}>⌖</button>
          </div>
        </div>
      </div>
    </div>
    <footer className="city-footer"><div><span className="city-status-dot"/>{t('city.prototype')}<span className="city-footer-note">{t('city.previewOnly')}</span></div><label>{t('city.historyPreview')}<select value={view.stage} onChange={e=>setView(v=>({...v,stage:e.target.value as CityView['stage']}))} data-testid="city-stage"><option value="settled">{t('city.settled')}</option><option value="growth">{t('city.growth')}</option><option value="decline">{t('city.decline')}</option></select></label></footer>
  </section>;
}


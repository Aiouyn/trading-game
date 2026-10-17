import { describe, it, expect } from 'vitest';
import { generateCity, terrain, TILE } from './generator';
import { CITY_IDS } from './types';
import { bindPrivatePlaces } from './bindings';
import { GAME_ASSETS } from '@/engine/universe';
describe('persistent public city plans',()=>{
  it.each(CITY_IDS)('%s has deterministic unique addresses, legal footprints and district landmarks',id=>{
    const scene=generateCity(id);
    expect(scene).toEqual(generateCity(id));
    expect(scene.buildings.length).toBeGreaterThan(40);
    expect(new Set(scene.buildings.map(b=>b.id)).size).toBe(scene.buildings.length);
    expect(new Set(scene.buildings.map(b=>b.address)).size).toBe(scene.buildings.length);
    for(const b of scene.buildings){
      expect(b.w).toBeGreaterThan(0); expect(b.w).toBeLessThan(TILE);
      expect(b.h).toBeGreaterThan(0);
      for(const [x,z] of [[b.x-b.w/2,b.z-b.d/2],[b.x+b.w/2,b.z+b.d/2]]) expect(terrain(id,x,z)).not.toBeNull();
      expect(scene.districts.some(d=>d.id===b.district)).toBe(true);
    }
    expect(scene.landmarks).toHaveLength(scene.districts.length);
    for(const a of GAME_ASSETS.filter(a=>a.assetClass==='stock'&&a.region=== (id==='meridia'?'meridian':id))){
      if(id!=='serena') expect(scene.buildings.some(b=>b.company?.id===a.id),a.id).toBe(true);
    }
  });
  it('places are owner-only units and never mutate the public artifact',()=>{
    const scene=generateCity('avalon'), original=JSON.stringify(scene);
    const a={id:'shop-a',name:'First shop',cityId:'avalon',kind:'business' as const};
    const b={id:'home-b',name:'Home',cityId:'avalon',districtId:'gilthill',kind:'property' as const};
    const bound=bindPrivatePlaces(scene,[a,b]);
    expect(bound).toHaveLength(2);
    expect(bindPrivatePlaces(scene,[b,a]).find(p=>p.id===a.id)).toEqual(bound[0]);
    expect(scene.buildings.find(p=>p.id===bound[1].buildingId)?.district).toBe('gilthill');
    expect(JSON.stringify(scene)).toBe(original);
    expect(original).not.toMatch(/ownerId|incomePerDay|positions|netWorth|shop-a|home-b/);
  });
  it('never places a property in a different district when no legal slot exists',()=>{
    expect(bindPrivatePlaces(generateCity('avalon'),[{id:'x',name:'X',cityId:'avalon',districtId:'unknown',kind:'property'}])).toEqual([]);
  });
});


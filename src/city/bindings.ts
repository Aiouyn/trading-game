import type { BoundPlace, CityScene, PrivatePlace } from './types';
export function hashKey(text: string): number {
  let h=2166136261;
  for (let i=0;i<text.length;i++) h=Math.imul(h^text.charCodeAt(i),16777619);
  return h>>>0;
}
/** Owner-only visual units. Different units may occupy the same building; no deeds are created. */
export function bindPrivatePlaces(scene: CityScene, places: PrivatePlace[]): BoundPlace[] {
  return places.filter(p=>p.cityId===scene.id).flatMap(p=>{
    const candidates=scene.buildings.filter(b=>b.kind!=='hq' && b.kind!=='landmark' && (p.kind!=='business'||b.kind!=='estate') && (!p.districtId || b.district===p.districtId));
    if(!candidates.length) return [];
    const b=candidates[hashKey(p.id)%candidates.length];
    return [{...p,buildingId:b.id,address:b.address+' · '+(p.kind==='business'?'Unit ':'Residence ')+hashKey(p.id).toString(36).toUpperCase()}];
  });
}


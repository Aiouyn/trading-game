// Authoritative geometry: imported by the HTTP route and tests, never by the City client.
import { CITIES, GAME_ASSETS } from '@/engine/universe';
import { Rng, seedStream } from '@/engine/rng';
import type { CityBuilding, CityId, CityScene } from './types';
import { createLandscape, shore } from './landscape';

export const GENERATOR_VERSION = 'quay-city-2';
export const TILE = 24;
const N = 32;
const PALETTES: Record<CityId, string[]> = {
  avalon: ['#806957', '#a08b73', '#b39d7e', '#647f80', '#718785', '#d0bd94'],
  nordhaven: ['#a28155', '#995d4e', '#7b9290', '#c6bba0', '#57706b', '#b9b9a8'],
  meridia: ['#ccad83', '#be9670', '#d9c9a2', '#ac7e62', '#c7bb9a', '#7c9390'],
  sundara: ['#ded1b1', '#c3b99c', '#b0c5b6', '#84a6a3', '#d0ba95', '#789899'],
  kaiyo: ['#667f88', '#7d9699', '#a6aba2', '#647077', '#b2a58d', '#58767a'],
  serena: ['#d8c8a8', '#b9ac8c', '#c4b494', '#9fb9ae', '#b5bdaa', '#d1c4a6'],
};

export function terrain(city: CityId, x: number, z: number): number | null {
  if (Math.abs(x) > 360 || Math.abs(z) > 360) return null;
  if (city === 'avalon') {
    if (Math.hypot(x + 70, z - 430) < 330) return null;
    if (x > 280 && z > 30 && z < 220 && Math.floor(z / 48) % 2 === 0) return null;
    return 3 + Math.max(0, 1 - Math.hypot(x + 255, z + 195) / 160) * 40;
  }
  if (city === 'nordhaven') {
    if (Math.abs(x - 25 * Math.sin(z / 120)) < 65) return null;
    return 4 + Math.floor(Math.max(0, Math.abs(x) - 100) / 55) * 12;
  }
  if (city === 'meridia') {
    if (z > 250 || Math.abs(x - 55 * Math.sin(z / 100)) < 25 || (z > 65 && z < 110)) return null;
    return 4;
  }
  if (city === 'sundara') {
    if (z > 170 + 28 * Math.sin(x / 120) || (x < -190 && Math.hypot(x + 275, z - 170) < 100)) return null;
    return 4 + Math.max(0, -z - 210) * 0.17;
  }
  if (city === 'kaiyo') {
    if (z > 265 || (x > 120 && x < 155)) return null;
    return 4;
  }
  // Scarce island scene. Every rendered estate remains an anonymous NPC vignette.
  const islands = [[-240,-170],[-65,-230],[155,-160],[-210,40],[40,25],[235,50],[-100,230],[150,245]];
  for (const [ix, iz] of islands) {
    const dist = Math.hypot(x-ix, z-iz);
    if (dist < 62) return 4 + Math.max(0, 45-dist)*0.08;
  }
  return null;
}
function districtOf(city: CityId, x: number, z: number): string {
  if (city === 'avalon') return x < -170 && z < -85 ? 'gilthill' : x > 150 && z > 0 ? 'docks' : z > 65 ? 'oldharbor' : 'midtown';
  if (city === 'nordhaven') return Math.abs(x) < 170 ? 'fjord' : 'oldtown';
  if (city === 'meridia') return z < -95 ? 'bizdist' : 'canal';
  if (city === 'sundara') return x < -100 ? 'palmbay' : 'sunset';
  if (city === 'kaiyo') return z < -80 ? 'heights' : 'neon';
  return 'cays';
}
const CBD: Record<CityId, [number,number]> = {
  avalon: [-20,-90], nordhaven: [125,-100], meridia: [-65,-230],
  sundara: [55,15], kaiyo: [-40,-190], serena: [40,25],
};
const LANDMARKS: Record<CityId, string[]> = {
  avalon: ['Avalon Exchange', 'Old Customs House', 'Eastside Freight Hall', 'Gilt Hill Observatory'],
  nordhaven: ['Fjord Forum', 'Gamla Design Museum'],
  meridia: ['Canal Loggia', 'Meridia Exchange'],
  sundara: ['Palm Bay Yacht Club', 'Sunset Grand Hotel'],
  kaiyo: ['Loop Gate', 'Shinbashi Hall'],
  serena: ['The Cays'],
};
/** Stable seeded geography and parcels. No account state, prices, wall clock or private data. */
export function generateCity(id: CityId, seed = 'port-avalon'): CityScene {
  const city = CITIES.find(c => c.id === id)!;
  const scene: CityScene = {
    version: 2, generator: GENERATOR_VERSION, id, name: city.name, seed,
    districts: city.districts.map(({id,name,blurb}) => ({id,name,blurb})),
    tiles: [], buildings: [], water: id === 'sundara' || id === 'serena' ? '#315858' : '#233d43',
    palette: PALETTES[id], landmarks: [], bounds: 780,
    landscape:{extent:2400,segments:0,heights:[],roads:[],trees:[],lake:{x:0,z:0,rx:0,rz:0}},viewpoints:[],
  };
  for (let gx=0; gx<N; gx++) for (let gz=0; gz<N; gz++) {
    const x=(gx-N/2)*TILE+TILE/2, z=(gz-N/2)*TILE+TILE/2;
    const corners = [[x-12,z-12],[x+12,z-12],[x-12,z+12],[x+12,z+12]];
    if ([...corners,[x,z],[x-12,z],[x+12,z],[x,z-12],[x,z+12]].some(([a,b]) => terrain(id,a,b) === null)) continue;
    const y = Math.round(Math.max(0.5,shore(id,x,z))*4)/4;
    const district = districtOf(id,x,z);
    const road = id !== 'serena' && (gx%5===0 || gz%5===0);
    const rng = new Rng(seedStream(seed, id+':parcel:'+gx+':'+gz));
    const park = !road && rng.uniform()<0.055;
    scene.tiles.push({x,z,y,road,park,district});
    if (road || park) continue;
    const heritage = district==='oldharbor' || district==='oldtown' || district==='canal' || district==='neon';
    const density = Math.exp(-Math.hypot(x-CBD[id][0],z-CBD[id][1])/135);
    const divisions = heritage ? 2 : 1;
    for (let sx=0;sx<divisions;sx++) for (let sz=0;sz<divisions;sz++) {
      const slot = id+':'+gx+':'+gz+':'+sx+':'+sz;
      const r = new Rng(seedStream(seed,slot));
      const size=TILE/divisions;
      let h=7+r.uniform()*14+density*(id==='kaiyo'?120:65);
      let kind: CityBuilding['kind']=density>0.5?'office':'housing';
      if (heritage) h=9+r.uniform()*15;
      if (district==='docks') { h=8+r.uniform()*7; kind='warehouse'; }
      if (district==='gilthill' || id==='serena') { h=8+r.uniform()*10; kind='estate'; }
      if (id==='nordhaven') h=Math.min(h,30);
      const w=Math.round((size-3-r.uniform()*3)*4)/4;
      const d=Math.round((size-3-r.uniform()*3)*4)/4;
      const bx=x+(sx-(divisions-1)/2)*size, bz=z+(sz-(divisions-1)/2)*size;
      if ([[bx-w/2,bz-d/2],[bx+w/2,bz-d/2],[bx-w/2,bz+d/2],[bx+w/2,bz+d/2]].some(([a,b])=>terrain(id,a,b)===null)) continue;
      scene.buildings.push({
        id:slot, x:x+(sx-(divisions-1)/2)*size, z:z+(sz-(divisions-1)/2)*size, y,
        w,d,h:Math.round(h*2)/2,district,kind,seed:r.nextU32(),
        color:kind==='warehouse'?['#a46d50','#99785b','#b7936e'][r.nextU32()%3]:kind==='housing'?['#c5b79b','#b78865','#9ca789','#d4c6aa','#879ea0','#aa806f'][r.nextU32()%6]:PALETTES[id][Math.floor(r.uniform()*PALETTES[id].length)],
        roof:heritage || id==='nordhaven' || kind==='estate' ? 'gable' : 'flat',
        name:city.districts.find(a=>a.id===district)!.name,
        address:String(gx*8+sx*2+sz+1)+' '+city.districts.find(a=>a.id===district)!.name+', Block '+String(gz+1),
        phase:Math.max(Math.abs(x),Math.abs(z))/360,
      });
    }
  }
  // Assign fixed launch sites from static initial market caps, never live ranks.
  if (id!=='serena') {
    const companies=GAME_ASSETS.filter(a=>a.assetClass==='stock' && a.region===city.region)
      .sort((a,b)=>(b.sharesOutstanding??1)*b.initialPrice-(a.sharesOutstanding??1)*a.initialPrice || a.id.localeCompare(b.id));
    const sites=scene.buildings.filter(b=>b.kind==='office' || b.district==='bizdist' || (b.kind==='housing' && b.roof==='flat'))
      .sort((a,b)=>Math.hypot(a.x-CBD[id][0],a.z-CBD[id][1])-Math.hypot(b.x-CBD[id][0],b.z-CBD[id][1]) || a.id.localeCompare(b.id));
    companies.forEach((a,i)=>{
      const b=sites[i]; if(!b) return;
      b.kind='hq'; b.name=a.name; b.company={id:a.id,name:a.name,sector:a.sector};
      b.h=Math.round(Math.max(28,Math.min(id==='kaiyo'?135:106,24+Math.log10(1+(a.sharesOutstanding??1)*a.initialPrice/1e9)*24+((i%5)-2)*7)));
      b.roof=i%5===0?'spire':'flat'; b.color=['#789ba6','#bead88','#9bada6','#cfbea0','#657e8d','#a17f60'][i%6];
    });
  }
  city.districts.forEach((d,i)=>{
    const candidates=scene.buildings.filter(b=>b.district===d.id && b.kind!=='hq')
      .sort((a,b)=>Math.abs(a.x)+Math.abs(a.z)-Math.abs(b.x)-Math.abs(b.z) || a.id.localeCompare(b.id));
    const b=candidates[Math.min(5,candidates.length-1)];
    if(!b) return;
    b.kind='landmark'; b.name=LANDMARKS[id][i]??d.name; b.color='#c3ae82';
    b.h=id==='serena'?15:24; b.roof=i%2===0?'spire':'gable'; scene.landmarks.push(b.id);
  });
  createLandscape(scene);
  return scene;
}


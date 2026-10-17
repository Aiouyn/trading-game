import { generateCity } from '@/city/generator';
import { CITY_IDS, type CityId, type CityScene } from '@/city/types';
// Only six fixed public city artifacts. Neither request nor cache accepts account data or arbitrary seeds.
const cache = new Map<CityId, CityScene>();
export async function GET(_request: Request, {params}: {params: Promise<{cityId:string}>}) {
  const {cityId}=await params;
  if (!(CITY_IDS as readonly string[]).includes(cityId)) return Response.json({error:'Unknown city'}, {status:404});
  const id=cityId as CityId;
  let scene=cache.get(id);
  if(!scene) { scene=generateCity(id); cache.set(id,scene); }
  return Response.json(scene,{headers:{'Cache-Control':'public, max-age=3600','X-City-Generator':scene.generator}});
}


'use client';
import { useMemo } from 'react';
import type { CityScene } from './types';
// Lightweight T0 image: consumes shipped geometry, never recomputes topology.
export function CityPicture({scene}:{scene:CityScene}) {
  const shapes=useMemo(()=>{
    const p=(x:number,y:number,z:number)=>[(x-z)*0.707,(x+z)*0.354-y*0.866];
    const points=(vs:number[][])=>vs.map(v=>p(v[0],v[1],v[2]).join(',')).join(' ');
    const ground=[];
    const landscape=scene.landscape,stride=landscape.segments+1;
    for(let iz=0;iz<landscape.segments;iz+=4)for(let ix=0;ix<landscape.segments;ix+=4){
      const coords=[[ix,iz],[ix+4,iz],[ix+4,iz+4],[ix,iz+4]];
      const vertices=coords.map(([x,z])=>[-landscape.extent+x*landscape.extent*2/landscape.segments,Math.max(.15,landscape.heights[z*stride+x]),-landscape.extent+z*landscape.extent*2/landscape.segments]);
      const water=coords.some(([x,z])=>landscape.heights[z*stride+x]<0);
      ground.push(<polygon key={ix+':'+iz} points={points(vertices)} fill={water?'#527f89':'#748b62'}/>);
    }
    const buildings=[...scene.buildings].sort((a,b)=>a.x+a.z-b.x-b.z).map(b=>{
      const x=b.x-b.w/2,z=b.z-b.d/2,y=b.y,top=y+b.h;
      return <g key={b.id} stroke="#1d3034" strokeWidth=".65">
        <polygon points={points([[x,top,z+b.d],[x+b.w,top,z+b.d],[x+b.w,y,z+b.d],[x,y,z+b.d]])} fill={b.color}/>
        <polygon points={points([[x+b.w,top,z],[x+b.w,top,z+b.d],[x+b.w,y,z+b.d],[x+b.w,y,z]])} fill={b.color} style={{filter:'brightness(.7)'}}/>
        <polygon points={points([[x,top,z],[x+b.w,top,z],[x+b.w,top,z+b.d],[x,top,z+b.d]])} fill={b.color} style={{filter:'brightness(1.2)'}}/>
      </g>;
    });return <>{ground}{buildings}</>;
  },[scene]);
  return <svg viewBox="-400 -270 800 580" className="city-picture" aria-hidden><rect x="-550" y="-450" width="1100" height="1000" fill="#748b62"/>{shapes}</svg>;
}


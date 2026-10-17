// Server-generated continuous height field and street ribbons. No DOM or private state.
import { Rng, seedStream } from '@/engine/rng';
import { LANDSCAPE_EXTENT } from './camera';
import type { CityId, CityScene, CityRoad } from './types';

export const LAKES:Record<CityId,[number,number,number,number]>={
  avalon:[-530,-95,140,104],nordhaven:[-475,-420,120,100],meridia:[-510,-340,145,95],
  sundara:[-465,-430,130,94],kaiyo:[-505,-290,148,108],serena:[-400,-450,125,105],
};
function smooth(a:number,b:number,x:number){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export function shore(city:CityId,x:number,z:number):number {
  let base=3+1.8*Math.sin(x/175)*Math.cos(z/210);
  if(city==='avalon') {
    const ax=Math.abs(x+70);
    const coast=ax<330?430-Math.sqrt(330*330-ax*ax):430+(ax-330)*0.18;
    if(z>coast)return -5-Math.min(25,(z-coast)*0.12);
    base=3+Math.max(0,1-Math.hypot(x+255,z+195)/160)*40;
  }else if(city==='nordhaven'){
    if(Math.abs(x-25*Math.sin(z/120))<65)return -12;
    base=4+Math.max(0,Math.abs(x)-100)*0.18;
  }else if(city==='meridia'){
    if(z>250||Math.abs(x-55*Math.sin(z/100))<25||(z>65&&z<110))return -7;
    base=4;
  }else if(city==='sundara'){
    if(z>170+28*Math.sin(x/120)||(x<-190&&Math.hypot(x+275,z-170)<100))return -8;
    base=4+Math.max(0,-z-210)*0.10;
  }else if(city==='kaiyo'){
    if(z>265||(x>120&&x<155))return -7;
    base=4;
  }else{
    const islands=[[-240,-170],[-65,-230],[155,-160],[-210,40],[40,25],[235,50],[-100,230],[150,245]];
    let nearest=Infinity;
    for(const[ix,iz]of islands)nearest=Math.min(nearest,Math.hypot(x-ix,z-iz));
    base=nearest<105?4+(1-smooth(45,105,nearest))*3:-8;
    // A mainland beyond the cays keeps the islands in a geographical context.
    if(x<-390)base=4+(1-smooth(-800,-390,x))*15;
  }
  if(base<0)return base;
  const[lx,lz,rx,rz]=LAKES[city];
  const radius=Math.hypot((x-lx)/rx,(z-lz)/rz);
  const edge=1+0.045*Math.sin(Math.atan2(z-lz,x-lx)*5);
  if(radius<edge)return -4+(radius/edge)*2;
  // Feather shorelines into green slopes, with broad hills outside the settled footprint.
  base *= smooth(edge,edge+0.18,radius);
  const country=smooth(350,650,Math.max(Math.abs(x),Math.abs(z)));
  return Math.max(0.5,base+country*(10+8*Math.sin(x/260)*Math.cos(z/300)));
}
function samples(a:[number,number],b:[number,number],city:CityId):[number,number,number][]{
  const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8));
  return Array.from({length:n+1},(_,i)=>{
    const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;
    return [x,Math.max(0.4,shore(city,x,z))+0.18,z];
  });
}
export function createLandscape(scene:CityScene):void {
  const segments=160, extent=LANDSCAPE_EXTENT;
  const heights:number[]=[];
  for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++){
    heights.push(Math.round(shore(scene.id,-extent+x*extent*2/segments,-extent+z*extent*2/segments)*4)/4);
  }
  const roads:CityRoad[]=[];
  // Existing launch blocks keep their identities. Continuous segments now carry road width and direction.
  for(const axis of ['x','z']as const)for(let line=0;line<32;line+=5){
    const coord=(line-16)*24+12;
    const tiles=scene.tiles.filter(t=>axis==='x'?t.x===coord:t.z===coord).sort((a,b)=>axis==='x'?a.z-b.z:a.x-b.x);
    let chain:typeof tiles=[];
    const flush=()=>{
      if(chain.length<2){chain=[];return;}
      const first=chain[0],last=chain[chain.length-1];
      const a:[number,number]=axis==='x'?[coord,first.z-12]:[first.x-12,coord];
      const b:[number,number]=axis==='x'?[coord,last.z+12]:[last.x+12,coord];
      roads.push({id:axis+':'+line+':'+roads.length,kind:line===15?'avenue':'street',width:line===15?12:7,path:samples(a,b,scene.id)});
      chain=[];
    };
    for(const tile of tiles){
      const prev=chain.at(-1);
      if(prev&&Math.abs(axis==='x'?tile.z-prev.z:tile.x-prev.x)>25){
        const gap=Math.hypot(tile.x-prev.x,tile.z-prev.z);
        if(gap<200 && scene.id!=='serena'){
          const path=samples([prev.x,prev.z],[tile.x,tile.z],scene.id).map((p,i,a)=>{
            const t=i/(a.length-1);return [p[0],prev.y*(1-t)+tile.y*t+Math.sin(t*Math.PI)*4+0.25,p[2]] as [number,number,number];
          });
          roads.push({id:'bridge:'+axis+':'+line+':'+roads.length,kind:'street',width:7,path,bridge:true});
        }
        flush();
      }
      chain.push(tile);
    }flush();
  }
  const[lx,lz,rx,rz]=LAKES[scene.id];
  const lakePath:[number,number,number][]=Array.from({length:81},(_,i)=>{
    const a=i/80*Math.PI*2,x=lx+Math.cos(a)*(rx+32),z=lz+Math.sin(a)*(rz+30);
    return [x,Math.max(0.4,shore(scene.id,x,z))+0.22,z];
  });
  roads.push({id:'lakeside-walk',kind:'path',width:3,path:lakePath});
  // A curving approach road joins the established western street to the lake/forest fringe.
  if(scene.id!=='serena'){
    const curve:[number,number,number][]=Array.from({length:81},(_,i)=>{
      const t=i/80,x=-360-402*t*t,z=-12-310*Math.sin(t*Math.PI*.9);
      return [x,Math.max(0.4,shore(scene.id,x,z))+0.2,z];
    });
    const end=curve.at(-1)!;
    curve.push(...samples([end[0],end[2]],[-LANDSCAPE_EXTENT,-240],scene.id).slice(1));
    roads.push({id:'woodland-boulevard',kind:'avenue',width:10,path:curve});
  }
  const trees:{x:number;y:number;z:number;scale:number;kind:number}[]=[];
  const rng=new Rng(seedStream(scene.seed,scene.id+':landscape'));
  for(let i=0;i<4200;i++){
    const x=(rng.uniform()*2-1)*1250,z=(rng.uniform()*2-1)*1100;
    const y=shore(scene.id,x,z);
    if(y<=1)continue;
    if(Math.abs(x)<370&&Math.abs(z)<370){
      const park=scene.tiles.find(t=>t.park&&Math.abs(t.x-x)<10&&Math.abs(t.z-z)<10);
      if(!park)continue;
    }
    const grove=Math.sin(x/94)*Math.cos(z/117);
    if(grove<-0.25&&rng.uniform()<0.8)continue;
    if(roads.some(r=>r.path.some(p=>Math.hypot(p[0]-x,p[2]-z)<r.width/2+5)))continue;
    trees.push({x:Math.round(x),y:Math.round(y*4)/4,z:Math.round(z),scale:0.75+rng.uniform()*1.2,kind:Math.floor(rng.uniform()*3)});
  }
  // Planted avenues: tree rows respect both street direction and intersection clearances.
  for(const r of roads.filter(r=>r.kind!=='path')){
    for(let i=4;i<r.path.length-4;i+=7){
      const p=r.path[i],n=r.path[i+1],dx=n[0]-p[0],dz=n[2]-p[2],length=Math.hypot(dx,dz)||1;
      for(const side of [-1,1]){
        const x=p[0]+side*(-dz/length)*(r.width/2+4),z=p[2]+side*(dx/length)*(r.width/2+4),y=shore(scene.id,x,z);
        if(y<=0||scene.buildings.some(b=>Math.abs(x-b.x)<b.w/2+2&&Math.abs(z-b.z)<b.d/2+2))continue;
        trees.push({x,y,z,scale:0.8,kind:scene.id==='sundara'?2:0});
      }
    }
  }
  scene.landscape={extent,segments,heights,roads,trees,lake:{x:lx,z:lz,rx,rz}};
  scene.viewpoints=[
    {id:'center',key:'city.downtown',x:scene.id==='serena'?40:-100,z:scene.id==='serena'?25:-80},
    {id:'lake',key:'city.lakeside',x:lx+rx*0.4,z:lz},
    {id:'neighborhood',key:'city.neighborhood',x:-245,z:140},
  ];
}


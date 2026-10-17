'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { t } from '@/i18n';
import { CityPicture } from './CityPicture';
import { addEnvironment } from './environment';
import { cameraFrame, clampPan, MIN_ELEVATION, MAX_ELEVATION } from './camera';
import type { CityScene, CityView } from './types';

export interface CityCanvasProps {
  scene: CityScene; view: CityView; owned: string[]; quotes: Record<string, number>; active: boolean;
  onSelect: (id: string | null) => void; onZoom: (delta: number) => void;
  onOrbit:(yaw:number,tilt:number)=>void;
}
interface Controller { update: (view: CityView, owned: string[], quotes: Record<string,number>)=>void; dispose: ()=>void }
const vertex = `
attribute float citySeed;
attribute vec3 citySize;
attribute float cityLit;
varying vec3 localPos;
varying vec3 faceNormal;
varying vec3 baseColor;
varying float seed;
varying float lit;
void main() {
  localPos = position * citySize;
  faceNormal = normalize(mat3(instanceMatrix) * normal);
  baseColor = instanceColor;
  seed = citySeed; lit = cityLit;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const fragment = `
uniform float night;
uniform float market;
varying vec3 localPos;
varying vec3 faceNormal;
varying vec3 baseColor;
varying float seed;
varying float lit;
float hash(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233))+seed*0.0001)*43758.5453); }
void main() {
  float light = 0.72 + 0.28 * max(0.0, dot(faceNormal, normalize(vec3(-0.6,1.0,0.35))));
  vec3 color = baseColor * light * mix(1.0,0.43,night);
  if(abs(faceNormal.y)<0.5) {
    float across = abs(faceNormal.x)>0.5 ? localPos.z : localPos.x;
    float style=mod(seed,4.0);
    vec2 grid = vec2(across/(2.6+style*0.45), localPos.y/(3.3+style*0.22));
    vec2 cell = fract(grid);
    float window = step(style<1.0?0.08:0.20,cell.x)*step(cell.x,style<1.0?0.90:0.69)*step(style>2.0?0.36:0.25,cell.y)*step(cell.y,style<1.0?0.87:0.66);
    float on = step(hash(floor(grid)),lit);
    vec3 darkGlass = mix(vec3(0.16,0.25,0.27),vec3(0.05,0.12,0.16),night);
    vec3 glass = mix(darkGlass, vec3(0.94,0.73,0.39),on*max(night,market*0.8));
    color = mix(color,glass,window);
    // Thin facade courses hold the illustrated look without a full-screen outline pass.
    color *= 1.0-0.14*step(cell.y,0.035);
  }
  gl_FragColor=vec4(color,1.0);
  #include <colorspace_fragment>
}`;

export default function CityCanvas({scene,view,owned,quotes,active,onSelect,onZoom,onOrbit}:CityCanvasProps) {
  const host=useRef<HTMLDivElement>(null);
  const controller=useRef<Controller|null>(null);
  const current=useRef({view,owned,quotes,active,onSelect,onZoom,onOrbit});
  const [failed,setFailed]=useState(false);
  useEffect(()=>{current.current={view,owned,quotes,active,onSelect,onZoom,onOrbit};controller.current?.update(view,owned,quotes);},[view,owned,quotes,active,onSelect,onZoom,onOrbit]);
  useEffect(()=>{
    const element=host.current;
    if(!element) return;
    let renderer:THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'}); }
    catch {
      const note=document.createElement('div');note.className='city-fallback-note';note.textContent=t('city.graphicsFallback');element.appendChild(note);
      element.dataset.renderer='picture';
      return ()=>{note.remove();delete element.dataset.renderer;};
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
    renderer.setClearColor('#151e25');
    renderer.domElement.setAttribute('aria-hidden','true');
    element.appendChild(renderer.domElement);
    const world=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-500,500,500,-500,1,4000);
    const geometries:THREE.BufferGeometry[]=[];
    const materials:THREE.Material[]=[];
    const regG=<T extends THREE.BufferGeometry>(g:T)=>{geometries.push(g);return g;};
    const regM=<T extends THREE.Material>(m:T)=>{materials.push(m);return m;};
    const ambient=new THREE.AmbientLight('#d2dfdc',1.0);world.add(ambient);
    const sun=new THREE.DirectionalLight('#fff0ce',1.4);sun.position.set(-500,900,350);world.add(sun);
    const environment=addEnvironment(world,scene);
    const dummy=new THREE.Object3D();
    const box=regG(new THREE.BoxGeometry(1,1,1));
    const bodyGeo=regG(new THREE.BoxGeometry(1,1,1));
    const seedAttr=new THREE.InstancedBufferAttribute(new Float32Array(scene.buildings.map(b=>b.seed%100000)),1);
    const sizeAttr=new THREE.InstancedBufferAttribute(new Float32Array(scene.buildings.flatMap(b=>[b.w,b.h,b.d])),3);
    const litAttr=new THREE.InstancedBufferAttribute(new Float32Array(scene.buildings.length).fill(0.65),1);
    bodyGeo.setAttribute('citySeed',seedAttr);bodyGeo.setAttribute('citySize',sizeAttr);bodyGeo.setAttribute('cityLit',litAttr);
    const shader=regM(new THREE.ShaderMaterial({
      vertexShader:vertex,fragmentShader:fragment,
      uniforms:{night:{value:0},market:{value:0}},
    }));
    const bodies=new THREE.InstancedMesh(bodyGeo,shader,scene.buildings.length);
    bodies.name='city-buildings';world.add(bodies);
    const roofMat=regM(new THREE.MeshLambertMaterial({color:'#53605e'}));
    const roofGeometry=regG(new THREE.ConeGeometry(0.71,1,4));roofGeometry.rotateY(Math.PI/4);
    const roofs=new THREE.InstancedMesh(roofGeometry,roofMat,scene.buildings.length);world.add(roofs);
    const podiums=new THREE.InstancedMesh(box,regM(new THREE.MeshLambertMaterial({color:'#b4ab90'})),scene.buildings.length);world.add(podiums);
    const setbackGeo=regG(new THREE.BoxGeometry(1,1,1));
    const setbackSize=new THREE.InstancedBufferAttribute(new Float32Array(scene.buildings.length*3),3);
    setbackGeo.setAttribute('citySeed',seedAttr);setbackGeo.setAttribute('citySize',setbackSize);setbackGeo.setAttribute('cityLit',litAttr);
    const setbacks=new THREE.InstancedMesh(setbackGeo,shader,scene.buildings.length);world.add(setbacks);
    const roofDetails=new THREE.InstancedMesh(box,regM(new THREE.MeshLambertMaterial({color:'#798987'})),scene.buildings.length);world.add(roofDetails);
    const highlight=new THREE.Mesh(regG(new THREE.BoxGeometry(1,1,1)),regM(new THREE.MeshBasicMaterial({color:'#e4c88b',transparent:true,opacity:0.25,depthWrite:false})));
    world.add(highlight);highlight.visible=false;
    const halo=new THREE.Mesh(regG(new THREE.RingGeometry(12,14,48)),regM(new THREE.MeshBasicMaterial({color:'#e4c88b',side:THREE.DoubleSide})));
    halo.rotation.x=-Math.PI/2;world.add(halo);halo.visible=false;
    // Simple physical cranes at future development sites. They are explicitly preview-only.
    const cranes=new THREE.Group();const craneMat=regM(new THREE.MeshBasicMaterial({color:'#c29d59'}));
    scene.buildings.filter(b=>b.phase>0.72 && b.phase<0.9 && b.kind!=='hq').slice(0,18).forEach(b=>{
      const pole=new THREE.Mesh(box,craneMat);pole.position.set(b.x,b.y+22,b.z);pole.scale.set(0.7,44,0.7);cranes.add(pole);
      const arm=new THREE.Mesh(box,craneMat);arm.position.set(b.x+6,b.y+43,b.z);arm.scale.set(24,0.7,0.7);cranes.add(arm);
      const rope=new THREE.Mesh(box,craneMat);rope.position.set(b.x+15,b.y+35,b.z);rope.scale.set(0.25,16,0.25);cranes.add(rope);
    });world.add(cranes);
    // Kaiyo's rail is a permanent visual constraint, not a new transport economy.
    if(scene.id==='kaiyo'){
      const rail=new THREE.Group();const mat=regM(new THREE.MeshLambertMaterial({color:'#c1b69a'}));
      [[0,-120,450,4],[-210,-15,4,210],[0,90,450,4],[210,-15,4,210]].forEach(([x,z,w,d])=>{
        const deck=new THREE.Mesh(box,mat);deck.position.set(x,18,z);deck.scale.set(w,2,d);rail.add(deck);
      });
      for(let x=-210;x<=210;x+=35)for(const z of [-120,90]){
        const p=new THREE.Mesh(box,mat);p.position.set(x,10,z);p.scale.set(2,16,2);rail.add(p);
      }world.add(rail);
    }
    const target=new THREE.Vector3(scene.viewpoints[0].x,0,scene.viewpoints[0].z);
    let angle=Math.PI/4, elevation=MIN_ELEVATION, zoom=1, raf=0, alive=true, visible=true, lastView:CityView|null=null;
    let width=1,height=1, frames=0;
    const visibleIndices=new Set<number>();
    const draw=()=>{
      raf=0;
      if(!alive || !visible || !current.current.active || document.hidden || width<1 || height<1) return;
      const frame=cameraFrame(width,height,zoom);
      camera.left=-frame.halfWidth;camera.right=frame.halfWidth;camera.top=frame.halfHeight;camera.bottom=-frame.halfHeight;
      [target.x,target.z]=clampPan(target.x,target.z);
      camera.position.set(target.x+Math.cos(angle)*1200*Math.cos(elevation),target.y+1200*Math.sin(elevation),target.z+Math.sin(angle)*1200*Math.cos(elevation));
      camera.lookAt(target);camera.updateProjectionMatrix();
      renderer.render(world,camera);frames++;
      element.dataset.frames=String(frames);
      element.dataset.renderer='webgl';
      element.dataset.yaw=angle.toFixed(4);element.dataset.elevation=elevation.toFixed(4);
      element.dataset.zoom=zoom.toFixed(3);element.dataset.pan=target.x.toFixed(2)+','+target.z.toFixed(2);
    };
    const requestDraw=()=>{if(alive && !raf && visible && !document.hidden)raf=requestAnimationFrame(draw);};
    const update=(v:CityView, own:string[], qs:Record<string,number>)=>{
      if(!current.current.active)return;
      const ownSet=new Set(own);const districtColors=['#bba171','#889b89','#899baa','#a87d68'];
      angle=Math.PI/4+v.rotation*Math.PI/2;elevation=Math.max(MIN_ELEVATION,Math.min(MAX_ELEVATION,v.elevation));zoom=v.zoom;
      if(v.focus && v.focus!==lastView?.focus){
        const b=scene.buildings.find(b=>b.id===v.focus);if(b)target.set(b.x,b.y,b.z);
      }
      if(v.focus && v.focus!==lastView?.focus){const point=scene.viewpoints.find(p=>'view:'+p.id===v.focus);if(point)target.set(point.x,0,point.z);}
      if(!v.focus && lastView?.focus)target.set(scene.viewpoints[0].x,0,scene.viewpoints[0].z);
      shader.uniforms.night.value=v.night?1:0;shader.uniforms.market.value=v.overlay==='market'?1:0;
      sun.intensity=v.night?0.16:1.4;ambient.intensity=v.night?0.4:1.0;environment.setNight(v.night);
      renderer.setClearColor(v.night?'#101922':'#23343b');
      visibleIndices.clear();
      const selectedBuilding=scene.buildings.find(b=>b.id===v.selected);
      scene.buildings.forEach((b,i)=>{
        const permanent=b.kind==='hq'||b.kind==='landmark'||ownSet.has(b.id);
        const show=permanent||v.stage!=='growth'||b.phase<0.78;
        if(show) visibleIndices.add(i);
        const cutaway=v.reveal&&selectedBuilding&&b.id!==selectedBuilding.id&&b.h>24&&Math.hypot(b.x-selectedBuilding.x,b.z-selectedBuilding.z)<165;
        const builtH=cutaway?Math.min(b.h,12):v.stage==='growth'&&b.phase>0.64&&!permanent?b.h*0.45:b.h;
        const setback=b.kind==='hq'&&builtH>40?builtH*0.18:0;
        setbackSize.setXYZ(i,b.w*.76,setback,b.d*.76);
        dummy.rotation.set(0,0,0);dummy.position.set(b.x,b.y+(builtH-setback)/2,b.z);dummy.scale.set(show?b.w:0,show?builtH-setback:0,show?b.d:0);
        dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);
        const color=ownSet.has(b.id)?'#d6bc82':v.overlay==='districts'?districtColors[scene.districts.findIndex(d=>d.id===b.district)%4]:b.color;
        bodies.setColorAt(i,new THREE.Color(color).multiplyScalar(v.stage==='decline'&&!permanent?0.76:1));
        sizeAttr.setY(i,builtH-setback);
        dummy.position.set(b.x,b.y+builtH-setback/2,b.z);dummy.scale.set(show&&setback>0?b.w*.76:0,setback,show&&setback>0?b.d*.76:0);dummy.updateMatrix();setbacks.setMatrixAt(i,dummy.matrix);setbacks.setColorAt(i,new THREE.Color(color));
        const roofWidth=setback>0?b.w*.76:b.w,roofDepth=setback>0?b.d*.76:b.d;
        dummy.position.set(b.x+b.w*.12,b.y+builtH+1,b.z-b.d*.15);dummy.scale.set(show&&b.roof==='flat'?roofWidth*.35:0,2,show&&b.roof==='flat'?roofDepth*.32:0);dummy.updateMatrix();roofDetails.setMatrixAt(i,dummy.matrix);
        const quote=b.company?qs[b.company.id]:undefined;
        litAttr.setX(i,v.stage==='decline'&&!permanent?0.08:quote!==undefined && v.overlay==='market'?0.5+0.3*Math.max(-1,Math.min(1,quote/0.05)):0.65);
        dummy.position.set(b.x,b.y+0.9,b.z);dummy.scale.set(show?b.w+1:0,show?1.8:0,show?b.d+1:0);dummy.updateMatrix();podiums.setMatrixAt(i,dummy.matrix);
        const roofH=b.roof==='spire'?Math.min(16,b.h*0.25):b.roof==='gable'?4:0;
        dummy.position.set(b.x,b.y+builtH+roofH/2,b.z);dummy.scale.set(show&&roofH>0?roofWidth:0,roofH,show&&roofH>0?roofDepth:0);
        dummy.updateMatrix();roofs.setMatrixAt(i,dummy.matrix);
      });
      for(const mesh of [bodies,roofs,podiums,setbacks,roofDetails]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
      if(bodies.instanceColor)bodies.instanceColor.needsUpdate=true;
      if(setbacks.instanceColor)setbacks.instanceColor.needsUpdate=true;
      sizeAttr.needsUpdate=true;
      setbackSize.needsUpdate=true;
      litAttr.needsUpdate=true;
      cranes.visible=v.stage==='growth';
      const selected=scene.buildings.find(b=>b.id===v.selected);
      highlight.visible=Boolean(selected);halo.visible=Boolean(selected);
      if(selected){
        highlight.position.set(selected.x,selected.y+selected.h/2,selected.z);highlight.scale.set(selected.w+1,selected.h+1,selected.d+1);
        halo.position.set(selected.x,selected.y+0.25,selected.z);
      }
      lastView=v;requestDraw();
    };
    const resize=new ResizeObserver(entries=>{
      const rect=entries[0].contentRect;width=rect.width;height=rect.height;
      renderer.setSize(Math.max(1,width),Math.max(1,height),false);requestDraw();
    });resize.observe(element);
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;requestDraw();});observer.observe(element);
    const onVisibility=()=>requestDraw();document.addEventListener('visibilitychange',onVisibility);
    const raycaster=new THREE.Raycaster();
    const pointer=new THREE.Vector2();
    const pointers=new Map<number,{x:number;y:number}>();
    let start:{x:number;y:number;tx:number;tz:number;orbit:boolean}|null=null, moved=false,pinch=0,twist=0;
    const down=(e:PointerEvent)=>{
      element.focus();element.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      start={x:e.clientX,y:e.clientY,tx:target.x,tz:target.z,orbit:e.button===2||e.shiftKey};moved=false;
      if(pointers.size===2){const ps=[...pointers.values()];pinch=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);twist=Math.atan2(ps[1].y-ps[0].y,ps[1].x-ps[0].x);moved=true;}
    };
    const move=(e:PointerEvent)=>{
      if(!pointers.has(e.pointerId))return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===2){
        const ps=[...pointers.values()],distance=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);
        const newTwist=Math.atan2(ps[1].y-ps[0].y,ps[1].x-ps[0].x);
        let delta=newTwist-twist;if(delta>Math.PI)delta-=Math.PI*2;if(delta<-Math.PI)delta+=Math.PI*2;
        if(pinch>0)current.current.onZoom((distance-pinch)*0.005);current.current.onOrbit(delta,0);twist=newTwist;pinch=distance;moved=true;return;
      }
      if(!start)return;
      const dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(start.orbit){
        current.current.onOrbit(-dx*0.006,dy*0.003);start.x=e.clientX;start.y=e.clientY;moved=true;return;
      }
      if(Math.abs(dx)+Math.abs(dy)>5)moved=true;
      if(moved){
        const scale=2*cameraFrame(width,height,zoom).halfHeight/Math.max(height,1);
        target.x=start.tx+(-dx*Math.sin(angle)-dy/Math.sin(elevation)*Math.cos(angle))*scale;
        target.z=start.tz+(dx*Math.cos(angle)-dy/Math.sin(elevation)*Math.sin(angle))*scale;
        [target.x,target.z]=clampPan(target.x,target.z);requestDraw();
      }
    };
    const up=(e:PointerEvent)=>{
      const canSelect=!moved&&pointers.size===1&&start;
      pointers.delete(e.pointerId);if(!pointers.size){start=null;pinch=0;}
      if(!canSelect)return;
      const rect=element.getBoundingClientRect();
      pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      const hit=raycaster.intersectObjects([bodies,setbacks,roofs,podiums]).find(h=>h.instanceId!==undefined&&visibleIndices.has(h.instanceId));
      current.current.onSelect(hit?.instanceId!==undefined?scene.buildings[hit.instanceId].id:null);
    };
    const wheel=(e:WheelEvent)=>{e.preventDefault();current.current.onZoom(-e.deltaY*0.0015);};
    const key=(e:KeyboardEvent)=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();const s=30/zoom;
      if(e.key==='ArrowLeft'){target.x-=Math.sin(angle)*s;target.z+=Math.cos(angle)*s;}
      if(e.key==='ArrowRight'){target.x+=Math.sin(angle)*s;target.z-=Math.cos(angle)*s;}
      if(e.key==='ArrowUp'){target.x-=Math.cos(angle)*s;target.z-=Math.sin(angle)*s;}
      if(e.key==='ArrowDown'){target.x+=Math.cos(angle)*s;target.z+=Math.sin(angle)*s;}requestDraw();
    };
    const cancel=(e:PointerEvent)=>{pointers.delete(e.pointerId);start=null;moved=true;};
    const noContext=(e:Event)=>e.preventDefault();
    const lost=(e:Event)=>{e.preventDefault();setFailed(true);};
    renderer.domElement.addEventListener('webglcontextlost',lost);
    element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);
    element.addEventListener('pointerup',up);element.addEventListener('pointercancel',cancel);
    element.addEventListener('wheel',wheel,{passive:false});element.addEventListener('keydown',key);
    element.addEventListener('contextmenu',noContext);
    controller.current={update,dispose:()=>{
      alive=false;cancelAnimationFrame(raf);resize.disconnect();observer.disconnect();
      document.removeEventListener('visibilitychange',onVisibility);
      element.removeEventListener('pointerdown',down);element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',up);
      element.removeEventListener('pointercancel',cancel);element.removeEventListener('wheel',wheel);element.removeEventListener('keydown',key);
      element.removeEventListener('contextmenu',noContext);
      renderer.domElement.removeEventListener('webglcontextlost',lost);
      environment.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();
    }};
    const c=current.current;update(c.view,c.owned,c.quotes);
    return ()=>{controller.current?.dispose();controller.current=null;};
  },[scene]);
  return <div ref={host} tabIndex={0} role="application" aria-label={t('city.mapLabel')} className="city-canvas" data-testid="city-canvas"><div className="city-picture-wrap"><CityPicture scene={scene}/></div>{failed && <div className="city-gpu-fallback"><CityPicture scene={scene}/><p>{t('city.graphicsFallback')}</p></div>}</div>;
}


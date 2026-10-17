'use client';
import * as THREE from 'three';
import type { CityScene, CityRoad } from './types';

/** Continuous landscape, streets and static civic detail, independent of market/player state. */
export function addEnvironment(world:THREE.Scene,scene:CityScene){
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
  const g=<T extends THREE.BufferGeometry>(v:T)=>{geometries.push(v);return v;};
  const m=<T extends THREE.Material>(v:T)=>{materials.push(v);return v;};
  const landscape=scene.landscape,extent=landscape.extent;
  const terrain=g(new THREE.PlaneGeometry(extent*2,extent*2,landscape.segments,landscape.segments));
  terrain.rotateX(-Math.PI/2);
  const pos=terrain.getAttribute('position');
  const colors=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const y=landscape.heights[i],x=pos.getX(i),z=pos.getZ(i);
    pos.setY(i,y);
    const country=Math.max(0,Math.min(1,(Math.max(Math.abs(x),Math.abs(z))-350)/500));
    const tint=new THREE.Color(y<1.3?'#b2b196':scene.id==='sundara'||scene.id==='serena'?'#81996a':'#748b62');
    tint.multiplyScalar(0.91+0.045*Math.sin(x/93)*Math.cos(z/117)+country*0.04);
    colors[i*3]=tint.r;colors[i*3+1]=tint.g;colors[i*3+2]=tint.b;
  }
  terrain.setAttribute('color',new THREE.BufferAttribute(colors,3));terrain.computeVertexNormals();
  const ground=new THREE.Mesh(terrain,m(new THREE.MeshLambertMaterial({vertexColors:true})));
  world.add(ground);
  const waterMaterial=m(new THREE.ShaderMaterial({
    uniforms:{color:{value:new THREE.Color(scene.id==='sundara'||scene.id==='serena'?'#5d9ba0':'#527f89')},night:{value:0}},
    vertexShader:'varying vec3 p; void main(){p=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 color;uniform float night;varying vec3 p;void main(){float ripple=sin(p.x*0.07+p.z*0.11)*sin(p.z*0.17-p.x*0.03);vec3 c=color*(0.96+ripple*0.055)*mix(1.0,0.36,night);gl_FragColor=vec4(c,1.0); #include <colorspace_fragment> }'.replace(' #include','\n#include').replace('> }','>\n}'),
  }));
  const water=new THREE.Mesh(g(new THREE.PlaneGeometry(extent*8,extent*8)),waterMaterial);
  water.rotation.x=-Math.PI/2;water.position.y=0.12;world.add(water);
  const box=g(new THREE.BoxGeometry(1,1,1)),dummy=new THREE.Object3D();
  const roads=m(new THREE.MeshLambertMaterial({color:'#576368'}));
  const sidewalks=m(new THREE.MeshLambertMaterial({color:'#bbbaa6'}));
  const pathMat=m(new THREE.MeshLambertMaterial({color:'#c1b695'}));
  function ribbon(road:CityRoad,width:number,lift:number){
    const vertices:number[]=[],idx:number[]=[];
    road.path.forEach((p,i)=>{
      const a=road.path[Math.max(0,i-1)],b=road.path[Math.min(road.path.length-1,i+1)];
      const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
      vertices.push(p[0]+nx*width/2,p[1]+lift,p[2]+nz*width/2,p[0]-nx*width/2,p[1]+lift,p[2]-nz*width/2);
      if(i>0){const k=i*2;idx.push(k-2,k,k-1,k-1,k,k+1);}
    });
    const geometry=g(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(idx);geometry.computeVertexNormals();
    return geometry;
  }
  for(const r of landscape.roads){
    if(r.kind!=='path')world.add(new THREE.Mesh(ribbon(r,r.width+3.4,0.1),sidewalks));
    world.add(new THREE.Mesh(ribbon(r,r.width,0.2),r.kind==='path'?pathMat:roads));
    if(r.bridge){
      const bridgeMat=m(new THREE.MeshLambertMaterial({color:'#a5a491'}));
      for(let i=2;i<r.path.length-2;i+=3){
        const p=r.path[i],next=r.path[i+1],dx=next[0]-p[0],dz=next[2]-p[2],len=Math.hypot(dx,dz)||1;
        for(const side of [-1,1]){
          const rail=new THREE.Mesh(box,bridgeMat);rail.position.set(p[0]+side*(-dz/len)*(r.width/2+1),p[1]+.9,p[2]+side*(dx/len)*(r.width/2+1));rail.scale.set(.35,1.3,25);rail.rotation.y=Math.atan2(dx,dz);world.add(rail);
        }
        const pier=new THREE.Mesh(box,bridgeMat);pier.position.set(p[0],p[1]/2,p[2]);pier.scale.set(r.width*.5,p[1],2.2);world.add(pier);
      }
    }
  }
  const streetRoads=landscape.roads.filter(r=>r.kind!=='path');
  const markers:{x:number;y:number;z:number;angle:number;w:number;d:number}[]=[];
  const lampSites:{x:number;y:number;z:number;angle:number}[]=[];
  for(const r of streetRoads)for(let i=2;i<r.path.length-2;i+=2){
    const p=r.path[i],n=r.path[i+1],dx=n[0]-p[0],dz=n[2]-p[2],len=Math.hypot(dx,dz)||1;
    const angle=Math.atan2(dx,dz);
    if(i%4===2)markers.push({x:p[0],y:p[1]+0.23,z:p[2],angle,w:0.24,d:2.8});
    if(i%8===2)lampSites.push({x:p[0]+(-dz/len)*(r.width/2+1.2),y:p[1],z:p[2]+(dx/len)*(r.width/2+1.2),angle});
  }
  const intersections=scene.tiles.filter(t=>t.road&&((t.x-12)/24+16)%5===0&&((t.z-12)/24+16)%5===0);
  for(const p of intersections){
    for(const axis of [0,1])for(const side of [-1,1])for(let stripe=0;stripe<5;stripe++){
      markers.push({x:p.x+(axis===0?side*9:stripe*1.05-2.1),y:p.y+0.45,z:p.z+(axis===1?side*9:stripe*1.05-2.1),angle:axis===0?Math.PI/2:0,w:0.55,d:4});
    }
  }
  const lane=new THREE.InstancedMesh(box,m(new THREE.MeshBasicMaterial({color:'#d6d4b8'})),markers.length);
  markers.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.w,0.025,p.d);dummy.updateMatrix();lane.setMatrixAt(i,dummy.matrix);});world.add(lane);

  const poleMat=m(new THREE.MeshLambertMaterial({color:'#596367'}));
  const poles=new THREE.InstancedMesh(box,poleMat,lampSites.length*2+intersections.length*2);
  const lamps=m(new THREE.MeshBasicMaterial({color:'#e7d3a0'}));
  const lightHeads=new THREE.InstancedMesh(box,lamps,lampSites.length);
  let pi=0;
  lampSites.forEach((p,i)=>{
    dummy.rotation.set(0,0,0);dummy.position.set(p.x,p.y+3.7,p.z);dummy.scale.set(.24,7.4,.24);dummy.updateMatrix();poles.setMatrixAt(pi++,dummy.matrix);
    dummy.position.set(p.x+Math.sin(p.angle)*.8,p.y+7.3,p.z+Math.cos(p.angle)*.8);dummy.scale.set(1.8,.18,.35);dummy.rotation.y=p.angle;dummy.updateMatrix();poles.setMatrixAt(pi++,dummy.matrix);
    dummy.position.y+=.08;dummy.scale.set(.7,.15,.55);dummy.updateMatrix();lightHeads.setMatrixAt(i,dummy.matrix);
  });world.add(lightHeads);
  const signalMat=m(new THREE.MeshBasicMaterial({color:'#8cb893'}));
  const signals=new THREE.InstancedMesh(box,signalMat,intersections.length*2);
  intersections.forEach((p,i)=>{
    for(let side=0;side<2;side++){
      const x=p.x+(side===0?5.4:-5.4),z=p.z+(side===0?-5.4:5.4);
      dummy.rotation.set(0,0,0);dummy.position.set(x,p.y+2.2,z);dummy.scale.set(.25,4.4,.25);dummy.updateMatrix();poles.setMatrixAt(pi++,dummy.matrix);
      dummy.position.set(x,p.y+4.3,z);dummy.scale.set(.6,1.4,.55);dummy.updateMatrix();signals.setMatrixAt(i*2+side,dummy.matrix);
      signals.setColorAt(i*2+side,new THREE.Color('#3d4d4d'));
    }
  });world.add(signals);world.add(poles);
  const bulbs=new THREE.InstancedMesh(g(new THREE.SphereGeometry(.2,6,5)),m(new THREE.MeshBasicMaterial({color:'#ffffff'})),intersections.length*2);
  intersections.forEach((p,i)=>{for(let side=0;side<2;side++){
    dummy.rotation.set(0,0,0);dummy.position.set(p.x+(side===0?5.4:-5.4),p.y+4.3,p.z+(side===0?-5.75:5.05));dummy.scale.set(1,1,1);dummy.updateMatrix();bulbs.setMatrixAt(i*2+side,dummy.matrix);bulbs.setColorAt(i*2+side,new THREE.Color(side===0?'#dd8063':'#9ac387'));
  }});world.add(bulbs);
  // Two canopy shapes and varying groups keep forests and street rows recognizable.
  const conifer=g(new THREE.ConeGeometry(3.2,9,7)),round=g(new THREE.IcosahedronGeometry(3.7,1));
  const foliage=m(new THREE.MeshLambertMaterial({color:'#6a815a'}));
  const treesA=new THREE.InstancedMesh(round,foliage,landscape.trees.length);
  const treesB=new THREE.InstancedMesh(conifer,foliage,landscape.trees.length);
  const trunks=new THREE.InstancedMesh(box,m(new THREE.MeshLambertMaterial({color:'#84725c'})),landscape.trees.length);
  landscape.trees.forEach((p,i)=>{
    dummy.rotation.set(0,(i%7)*.37,0);dummy.position.set(p.x,p.y+4.5*p.scale,p.z);
    dummy.scale.set(p.kind===1?0:p.scale,p.kind===1?0:p.scale*1.2,p.kind===1?0:p.scale);dummy.updateMatrix();treesA.setMatrixAt(i,dummy.matrix);
    dummy.position.y=p.y+5.5*p.scale;dummy.scale.set(p.kind===1?p.scale:0,p.kind===1?p.scale:0,p.kind===1?p.scale:0);dummy.updateMatrix();treesB.setMatrixAt(i,dummy.matrix);
    const c=new THREE.Color(['#597a54','#71875b','#879661'][p.kind]);treesA.setColorAt(i,c);treesB.setColorAt(i,c);
    dummy.position.y=p.y+2*p.scale;dummy.scale.set(.7*p.scale,4*p.scale,.7*p.scale);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  });world.add(treesA,treesB,trunks);
  // Small plazas/forecourts make the transition from facade to street intentional.
  const plazas=new THREE.InstancedMesh(box,m(new THREE.MeshLambertMaterial({color:'#b9b5a0'})),scene.buildings.length);
  scene.buildings.forEach((b,i)=>{dummy.rotation.set(0,0,0);dummy.position.set(b.x,b.y+.12,b.z);dummy.scale.set(b.w+2,.24,b.d+2);dummy.updateMatrix();plazas.setMatrixAt(i,dummy.matrix);});world.add(plazas);
  return {
    setNight(night:boolean){waterMaterial.uniforms.night.value=night?1:0;lamps.color.set(night?'#edce82':'#c8c6af');},
    dispose(){geometries.forEach(v=>v.dispose());materials.forEach(v=>v.dispose());},
  };
}


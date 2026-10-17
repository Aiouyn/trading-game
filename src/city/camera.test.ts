import {describe,it,expect} from 'vitest';
import {cameraFrame,clampPan,clampZoom,LANDSCAPE_EXTENT,PAN_LIMIT,MIN_ELEVATION} from './camera';
import {generateCity} from './generator';
import {shore} from './landscape';
describe('immersive city camera and landscape',()=>{
  it('keeps water between the Serena islands and terrain on the estates',()=>{
    expect(shore('serena',0,300)).toBeLessThan(0);
    expect(shore('serena',40,25)).toBeGreaterThan(0);
    expect(shore('nordhaven',0,0)).toBeLessThan(0);
  });
  it('never exposes the terrain edge at supported zoom, pan and any orbit angle',()=>{
    for(const aspect of [0.15,0.46,0.8,1,1.8,3,8])for(const zoom of [1,1.12,2,3.6]){
      const frame=cameraFrame(aspect*1000,1000,zoom);
      // Include the extra ground reach under the lowest seabed, plus a generous numerical margin.
      const farGround=frame.halfHeight/Math.sin(MIN_ELEVATION)+100;
      for(let a=0;a<Math.PI*2;a+=Math.PI/24){
        const xReach=Math.abs(Math.sin(a))*frame.halfWidth+Math.abs(Math.cos(a))*farGround;
        const zReach=Math.abs(Math.cos(a))*frame.halfWidth+Math.abs(Math.sin(a))*farGround;
        expect(PAN_LIMIT+xReach).toBeLessThan(LANDSCAPE_EXTENT);
        expect(PAN_LIMIT+zReach).toBeLessThan(LANDSCAPE_EXTENT);
      }
    }
    expect(clampZoom(-100)).toBe(1);expect(clampZoom(100)).toBe(3.6);
    expect(clampPan(1e5,-1e5)).toEqual([PAN_LIMIT,-PAN_LIMIT]);
  });
  it('ships continuous terrain, a real lake, directed streets and curved paths',()=>{
    const city=generateCity('avalon'),land=city.landscape;
    expect(land.heights).toHaveLength((land.segments+1)**2);
    expect(land.heights.some(h=>h<0)).toBe(true);
    expect(land.heights.some(h=>h>20)).toBe(true);
    expect(land.roads.some(r=>r.kind==='path')).toBe(true);
    expect(land.trees.length).toBeGreaterThan(500);
    const avenue=land.roads.find(r=>r.id==='woodland-boulevard')!;
    expect(new Set(avenue.path.map(p=>p[0])).size).toBeGreaterThan(30);
    expect(new Set(avenue.path.map(p=>p[2])).size).toBeGreaterThan(30);
    // The approach road must stay out of the lake; an accidental submerged road is not a bridge.
    for(const [x,,z] of avenue.path){
      const lake=land.lake;
      expect(Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)).toBeGreaterThan(1.05);
    }
  });
});


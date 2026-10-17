export const MIN_ZOOM=1;
export const MAX_ZOOM=3.6;
export const PAN_LIMIT=780;
export const LANDSCAPE_EXTENT=2400;
export const MIN_ELEVATION=Math.PI/6;
export const MAX_ELEVATION=Math.PI*0.36;
export function clampZoom(zoom:number):number{return Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom));}
export function cameraFrame(width:number,height:number,zoom:number){
  const aspect=Math.max(0.15,width/Math.max(1,height));
  const halfHeight=Math.min(440,900/aspect,230*Math.max(1,0.8/aspect))/clampZoom(zoom);
  return {halfHeight,halfWidth:halfHeight*aspect};
}
export function clampPan(x:number,z:number):[number,number]{
  return [Math.max(-PAN_LIMIT,Math.min(PAN_LIMIT,x)),Math.max(-PAN_LIMIT,Math.min(PAN_LIMIT,z))];
}


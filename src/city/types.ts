export const CITY_IDS = ['avalon', 'nordhaven', 'meridia', 'sundara', 'kaiyo', 'serena'] as const;
export type CityId = typeof CITY_IDS[number];
export type BuildingKind = 'housing' | 'office' | 'warehouse' | 'landmark' | 'hq' | 'estate';
export interface CityTile { x: number; z: number; y: number; road: boolean; park: boolean; district: string }
export interface CityBuilding {
  id: string; x: number; z: number; y: number; w: number; d: number; h: number;
  district: string; kind: BuildingKind; seed: number; color: string;
  roof: 'flat' | 'gable' | 'spire'; name: string; address: string;
  company?: { id: string; name: string; sector: string };
  phase: number;
}
export interface CityScene {
  version: 2; generator: string; id: CityId; name: string; seed: string;
  districts: { id: string; name: string; blurb: string }[];
  tiles: CityTile[]; buildings: CityBuilding[]; water: string; palette: string[];
  landmarks: string[]; bounds: number;
  landscape: {extent:number;segments:number;heights:number[];roads:CityRoad[];trees:{x:number;y:number;z:number;scale:number;kind:number}[];lake:{x:number;z:number;rx:number;rz:number}};
  viewpoints:{id:string;key:string;x:number;z:number}[];
}
export interface CityRoad {id:string;kind:'street'|'avenue'|'path';width:number;path:[number,number,number][];bridge?:boolean}
export type CityOverlay = 'places' | 'districts' | 'market';
export type CityStage = 'settled' | 'growth' | 'decline';
export interface CityView {
  rotation: number; zoom: number; night: boolean; overlay: CityOverlay;
  stage: CityStage; selected: string | null; focus: string | null; reveal: boolean; elevation:number;
}
export interface PrivatePlace { id: string; name: string; cityId: string; districtId?: string; kind: 'business' | 'property' }
export interface BoundPlace extends PrivatePlace { buildingId: string; address: string }


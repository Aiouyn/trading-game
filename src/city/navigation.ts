'use client';
import { create } from 'zustand';
import { openFromShell } from '@/components/os/openApp';
import { CITY_IDS, type CityId } from './types';
// Ephemeral owner-only navigation. Never in routes, shell preferences or the public city cache.
export const useCityVisit=create<{request:{cityId:CityId;placeId:string}|null}>()(()=>({request:null}));
export function showMyPlace(cityId:string,placeId:string):void {
  if(!(CITY_IDS as readonly string[]).includes(cityId))return;
  useCityVisit.setState({request:{cityId:cityId as CityId,placeId}});
  openFromShell('city');
}


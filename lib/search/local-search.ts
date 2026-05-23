import type { ParsedSearchIntent, SearchLocation } from './types';
import { hasValidCoordinates, matchesCategory, matchesGeo } from './filters';

export function localFirstFilter(locations:SearchLocation[], intent:ParsedSearchIntent){
  const restaurants=locations.filter((l)=>String(l.location_type||'').toLowerCase()==='restaurant' && hasValidCoordinates(l) && matchesGeo(l,intent) && matchesCategory(l,intent.restaurantType,true));
  const activities=locations.filter((l)=>String(l.location_type||'').toLowerCase()!=='restaurant' && hasValidCoordinates(l) && matchesGeo(l,intent) && matchesCategory(l,intent.activityType,false));
  return {restaurants, activities};
}

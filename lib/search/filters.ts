import type { ParsedSearchIntent, SearchLocation } from './types';

const n=(v:unknown)=>String(v||'').trim().toLowerCase();

export function hasValidCoordinates(item:SearchLocation){
  return Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
}

export function matchesGeo(item:SearchLocation, intent:ParsedSearchIntent){
  const city = n(item.city);
  const borough = n(item.borough);
  const requestedCity = n(intent.city);
  const requestedBorough = n(intent.borough);

  if (requestedCity && !requestedBorough) {
    const cityMatches = city===requestedCity || city.includes(requestedCity) || requestedCity.includes(city);
    if (!cityMatches) return false;
  }

  if (requestedBorough && borough!==requestedBorough && !city.includes(requestedBorough)) return false;
  return true;
}

export function matchesCategory(item:SearchLocation, type:string|null, isRestaurant:boolean){
  if (!type) return true;
  const hay = [item.cuisine,item.cuisine_type,item.activity_type,item.category,item.subcategory,item.name,item.restaurant_name,item.activity_name].map(n).join(' ');
  if (isRestaurant) return hay.includes(n(type));
  return hay.includes(n(type));
}

import type { ParsedSearchIntent, SearchLocation } from './types';

const n=(v:unknown)=>String(v||'').trim().toLowerCase();

export function hasValidCoordinates(item:SearchLocation){
  return Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
}

export function matchesGeo(item:SearchLocation, intent:ParsedSearchIntent){
  if (intent.city && !intent.borough) {
    const city = n(item.city);
    const requestedCity = n(intent.city);
    if (city !== requestedCity && !city.includes(requestedCity)) return false;
  }
  if (intent.borough && n(item.borough)!==n(intent.borough) && !n(item.city).includes(n(intent.borough))) return false;
  return true;
}

export function matchesCategory(item:SearchLocation, type:string|null, isRestaurant:boolean){
  if (!type) return true;
  const hay = [item.cuisine,item.cuisine_type,item.activity_type,item.category,item.subcategory,item.name,item.restaurant_name,item.activity_name].map(n).join(' ');
  if (isRestaurant) return hay.includes(n(type));
  return hay.includes(n(type));
}

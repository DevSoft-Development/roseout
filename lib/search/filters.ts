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

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  steak: ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet mignon"],
  hookah: ["hookah", "shisha", "lounge"],
};

function tokenizeCategory(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && token !== "dinner");
}

function getCategoryCandidates(type: string) {
  const normalized = n(type);
  const tokens = new Set<string>([normalized, ...tokenizeCategory(normalized)]);

  for (const token of Array.from(tokens)) {
    const synonyms = CATEGORY_SYNONYMS[token];
    if (!synonyms) continue;
    for (const synonym of synonyms) tokens.add(n(synonym));
  }

  return Array.from(tokens).filter(Boolean);
}

export function matchesCategory(item:SearchLocation, type:string|null, isRestaurant:boolean){
  if (!type) return true;
  const hay = [item.cuisine,item.cuisine_type,item.activity_type,item.category,item.subcategory,item.name,item.restaurant_name,item.activity_name].map(n).join(' ');
  const candidates = getCategoryCandidates(type);

  if (!candidates.length) return true;

  if (isRestaurant) {
    return candidates.some((candidate) => hay.includes(candidate));
  }

  return candidates.some((candidate) => hay.includes(candidate));
}

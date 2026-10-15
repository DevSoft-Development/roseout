/**
 * Address-only geocoding for new, US location candidates.
 * Census street-range points are approximate; never proof of a storefront.
 * Geoapify API use is subject to account free quota and attribution terms.
 */
export type GeocodeResult = {
  latitude: number;
  longitude: number;
  provider: "census" | "geoapify";
  matchedAddress: string;
  precision: "street_range" | "building";
  attribution: string | null;
};
type Address = { street: string; city: string; state: string; zip?: string | null };
const clean = (v: unknown) => String(v || "").trim().replace(/\s+/g, " ");
export function normalizedAddress(input: Address) {
  const street = clean(input.street);
  const city = clean(input.city);
  const state = clean(input.state).toUpperCase();
  const zip = clean(input.zip);
  if (!/^\d+\s+\S+/.test(street) || street.length > 180 ||
    !city || city.length > 120 || !/^[A-Z]{2}$/.test(state) ||
    (zip && !/^\d{5}(?:-\d{4})?$/.test(zip))) return null;
  return {street,city,state,zip};
}
function validPoint(lat: unknown, lon: unknown) {
  const latitude=Number(lat), longitude=Number(lon);
  if (!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<18||latitude>72||longitude< -180||longitude> -60) return null;
  return {latitude,longitude};
}
async function json(url:URL, fetcher:typeof fetch) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetcher(url,{cache:"no-store",signal:controller.signal,headers:{accept:"application/json"}});
    if (!response.ok) return null;
    return await response.json() as Record<string,any>;
  } finally {clearTimeout(timeout);}
}
export async function censusGeocode(address: Address, fetcher:typeof fetch=fetch):Promise<GeocodeResult|null> {
  const valid=normalizedAddress(address);
  if(!valid)return null;
  const url=new URL("https://geocoding.geo.census.gov/geocoder/geographies/address");
  url.searchParams.set("street",valid.street);
  url.searchParams.set("city",valid.city);
  url.searchParams.set("state",valid.state);
  if(valid.zip)url.searchParams.set("zip",valid.zip);
  url.searchParams.set("benchmark","Public_AR_Current");
  url.searchParams.set("vintage","Current_Current");
  url.searchParams.set("format","json");
  const data=await json(url,fetcher);
  const matches=data?.result?.addressMatches;
  if (!Array.isArray(matches)||matches.length!==1)return null;
  const match=matches[0],point=validPoint(match?.coordinates?.y,match?.coordinates?.x);
  if(!point || !String(match?.matchedAddress||"").toUpperCase().includes(valid.state))return null;
  return {...point,provider:"census",precision:"street_range",matchedAddress:String(match.matchedAddress),attribution:null};
}
export async function geoapifyGeocode(address:Address,key:string,fetcher:typeof fetch=fetch):Promise<GeocodeResult|null> {
  const valid=normalizedAddress(address);
  if(!valid||!key.trim())return null;
  const url=new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text",[valid.street,valid.city,valid.state,valid.zip,"USA"].filter(Boolean).join(", "));
  url.searchParams.set("filter","countrycode:us");
  url.searchParams.set("limit","2");
  url.searchParams.set("apiKey",key);
  const data=await json(url,fetcher), features=data?.features;
  if(!Array.isArray(features)||features.length!==1)return null;
  const properties=features[0]?.properties||{};
  if(String(properties.state_code||"").toUpperCase()!==valid.state)return null;
  if(String(properties.rank?.match_type||"")!=="full_match" && Number(properties.rank?.confidence||0)<0.95)return null;
  if(String(properties.result_type||"")!=="building" && String(properties.result_type||"")!=="amenity")return null;
  const point=validPoint(properties.lat,properties.lon);
  if(!point)return null;
  return {...point,provider:"geoapify",precision:"building",matchedAddress:String(properties.formatted||""),attribution:"© OpenStreetMap contributors; Geoapify"};
}
export async function geocodeFreeFirst(
  address:Address, options:{geoapifyKey?:string;fetcher?:typeof fetch}={}
):Promise<GeocodeResult|null> {
  const fetcher=options.fetcher||fetch;
  let census:GeocodeResult|null=null;
  try {census=await censusGeocode(address,fetcher);}catch {/* fallback on outages */ }
  if(census)return census;
  if(!options.geoapifyKey)return null;
  try{return await geoapifyGeocode(address,options.geoapifyKey,fetcher);}catch{return null;}
}

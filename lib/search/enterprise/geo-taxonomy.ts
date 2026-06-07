import type { EnterpriseLocation, GeoIntent } from "./types";

type GeoType = "neighborhood" | "borough" | "city" | "county" | "region" | "state";
export type GeoTaxonomyRecord = { name: string; aliases: string[]; type: GeoType; city?: string; borough?: string; county?: string; region?: string; state: string; latitude: number; longitude: number; defaultRadiusMiles: number };

const base: GeoTaxonomyRecord[] = [
  { name: "Astoria", aliases: ["astoria"], type: "neighborhood", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7644, longitude: -73.9235, defaultRadiusMiles: 3 },
  { name: "Long Island City", aliases: ["long island city", "lic"], type: "neighborhood", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7447, longitude: -73.9485, defaultRadiusMiles: 3 },
  { name: "Queens", aliases: ["queens", "queens ny"], type: "borough", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7282, longitude: -73.7949, defaultRadiusMiles: 10 },
  { name: "Manhattan", aliases: ["manhattan", "new york city", "nyc"], type: "borough", city: "New York", borough: "Manhattan", county: "New York County", state: "NY", latitude: 40.7831, longitude: -73.9712, defaultRadiusMiles: 8 },
  { name: "Brooklyn", aliases: ["brooklyn"], type: "borough", city: "New York", borough: "Brooklyn", county: "Kings County", state: "NY", latitude: 40.6782, longitude: -73.9442, defaultRadiusMiles: 9 },
  { name: "Bronx", aliases: ["bronx", "the bronx"], type: "borough", city: "New York", borough: "Bronx", county: "Bronx County", state: "NY", latitude: 40.8448, longitude: -73.8648, defaultRadiusMiles: 8 },
  { name: "Staten Island", aliases: ["staten island"], type: "borough", city: "New York", borough: "Staten Island", county: "Richmond County", state: "NY", latitude: 40.5795, longitude: -74.1502, defaultRadiusMiles: 8 },
  { name: "Nassau County", aliases: ["nassau", "nassau county"], type: "county", county: "Nassau County", region: "Long Island", state: "NY", latitude: 40.6546, longitude: -73.5594, defaultRadiusMiles: 18 },
  { name: "Suffolk County", aliases: ["suffolk", "suffolk county"], type: "county", county: "Suffolk County", region: "Long Island", state: "NY", latitude: 40.9849, longitude: -72.6151, defaultRadiusMiles: 35 },
  { name: "Long Island", aliases: ["long island", "li ny"], type: "region", region: "Long Island", state: "NY", latitude: 40.7891, longitude: -73.135, defaultRadiusMiles: 45 },
  { name: "New Jersey", aliases: ["new jersey", "nj", "northern new jersey", "north jersey"], type: "state", region: "Northern New Jersey", state: "NJ", latitude: 40.7357, longitude: -74.1724, defaultRadiusMiles: 30 },
  { name: "Jersey City", aliases: ["jersey city", "jc"], type: "city", city: "Jersey City", county: "Hudson County", state: "NJ", latitude: 40.7178, longitude: -74.0431, defaultRadiusMiles: 5 },
  { name: "Hoboken", aliases: ["hoboken"], type: "city", city: "Hoboken", county: "Hudson County", state: "NJ", latitude: 40.7433, longitude: -74.0324, defaultRadiusMiles: 4 },
  { name: "Connecticut", aliases: ["connecticut", "ct"], type: "state", region: "Connecticut", state: "CT", latitude: 41.0534, longitude: -73.5387, defaultRadiusMiles: 30 },
  { name: "Stamford", aliases: ["stamford", "stamford ct"], type: "city", city: "Stamford", county: "Fairfield County", state: "CT", latitude: 41.0534, longitude: -73.5387, defaultRadiusMiles: 6 },
  { name: "Miami", aliases: ["miami", "miami fl"], type: "city", city: "Miami", county: "Miami-Dade County", state: "FL", latitude: 25.7617, longitude: -80.1918, defaultRadiusMiles: 10 },
];
const add = (name: string, type: GeoType, parent: Partial<GeoTaxonomyRecord>, lat: number, lon: number, aliases: string[] = []) => base.push({ name, aliases: [name.toLowerCase(), ...aliases], type, state: parent.state ?? "NY", city: parent.city, borough: parent.borough, county: parent.county, region: parent.region, latitude: lat, longitude: lon, defaultRadiusMiles: type === "neighborhood" ? 3 : type === "city" ? 6 : 12 });
const man = { city: "New York", borough: "Manhattan", county: "New York County", state: "NY" };
["Midtown","Midtown East","Midtown West","Hell's Kitchen","Times Square","Theater District","Chelsea","Flatiron","NoMad","Gramercy","Union Square","Greenwich Village","West Village","East Village","Lower East Side","SoHo","NoHo","Tribeca","Financial District","FiDi","Battery Park City","Chinatown","Little Italy","Nolita","Upper East Side","UES","Upper West Side","UWS","Harlem","East Harlem","Spanish Harlem","Washington Heights","Inwood","Hudson Yards","Murray Hill","Kips Bay"].forEach((n,i)=>add(n,"neighborhood",man,40.72+i*0.006,-74.01+i*0.002,n==="FiDi"?["financial district"]:n==="UES"?["upper east side"]:n==="UWS"?["upper west side"]:[]));
const bk = { city: "New York", borough: "Brooklyn", county: "Kings County", state: "NY" };
["Williamsburg","Greenpoint","DUMBO","Downtown Brooklyn","Brooklyn Heights","Cobble Hill","Boerum Hill","Carroll Gardens","Park Slope","Prospect Heights","Fort Greene","Clinton Hill","Bedford-Stuyvesant","Bed-Stuy","Bushwick","Crown Heights","Prospect Lefferts Gardens","PLG","Flatbush","Ditmas Park","Kensington","Sunset Park","Bay Ridge","Red Hook","Gowanus","Industry City","Coney Island","Brighton Beach","Sheepshead Bay","Canarsie","East New York","Brownsville"].forEach((n,i)=>add(n,"neighborhood",bk,40.70-i*0.006,-73.96+i*0.002,n==="Bed-Stuy"?["bedford stuyvesant"]:n==="PLG"?["prospect lefferts gardens"]:[]));
const qn = { city: "New York", borough: "Queens", county: "Queens County", state: "NY" };
["Sunnyside","Woodside","Jackson Heights","Elmhurst","Corona","Flushing","Murray Hill Queens","Bayside","Whitestone","College Point","Forest Hills","Rego Park","Kew Gardens","Richmond Hill","Jamaica","Jamaica Estates","Hollis","Queens Village","Cambria Heights","St. Albans","Springfield Gardens","Laurelton","Rosedale","Far Rockaway","Rockaway Beach","Arverne","Ridgewood","Maspeth","Middle Village","Glendale","Ozone Park","South Ozone Park","Howard Beach","Fresh Meadows","Briarwood"].forEach((n,i)=>add(n,"neighborhood",qn,40.75-i*0.004,-73.92+i*0.005));
const bx = { city: "New York", borough: "Bronx", county: "Bronx County", state: "NY" };
["South Bronx","Mott Haven","Port Morris","Melrose","Highbridge","Morrisania","Fordham","Belmont","Little Italy Bronx","Arthur Avenue","Riverdale","Kingsbridge","Throgs Neck","Pelham Bay","City Island","Parkchester","Soundview","Hunts Point","Co-op City","Wakefield","Woodlawn"].forEach((n,i)=>add(n,"neighborhood",bx,40.81+i*0.005,-73.92+i*0.004));
const si = { city: "New York", borough: "Staten Island", county: "Richmond County", state: "NY" };
["St. George","Stapleton","Tompkinsville","Clifton","Rosebank","New Brighton","West Brighton","Port Richmond","Mariners Harbor","Great Kills","Tottenville","New Dorp","Eltingville","Huguenot","Annadale"].forEach((n,i)=>add(n,"neighborhood",si,40.64-i*0.007,-74.08-i*0.003));
["Hempstead","North Hempstead","Oyster Bay","Garden City","Mineola","Westbury","New Hyde Park","Great Neck","Manhasset","Port Washington","Roslyn","Glen Cove","Syosset","Hicksville","Levittown","Bethpage","Plainview","Farmingdale","Massapequa","Massapequa Park","Freeport","Baldwin","Rockville Centre","Lynbrook","Valley Stream","Elmont","Franklin Square","Uniondale","East Meadow","Merrick","Bellmore","Wantagh","Seaford","Long Beach","Oceanside","Island Park"].forEach((n,i)=>add(n,"city",{ county:"Nassau County", region:"Long Island", state:"NY"},40.75-i*0.004,-73.70+i*0.006));
["Huntington","Huntington Station","Melville","Dix Hills","Commack","Smithtown","Hauppauge","Stony Brook","Port Jefferson","Setauket","Ronkonkoma","Lake Ronkonkoma","Patchogue","Medford","Holbrook","Islip","East Islip","Bay Shore","Brentwood","Central Islip","Babylon","West Babylon","Deer Park","Lindenhurst","Amityville","Copiague","Sayville","Bohemia","Riverhead","Southampton","East Hampton","Montauk","Greenport"].forEach((n,i)=>add(n,"city",{ county:"Suffolk County", region:"Long Island", state:"NY"},40.86+i*0.003,-73.42+i*0.025));
["Weehawken","Union City","North Bergen","West New York","Secaucus","Bayonne","Kearny","Harrison","Newark","Downtown Newark","Ironbound","Elizabeth","Linden","Rahway","Union","Montclair","Bloomfield","Glen Ridge","West Orange","East Orange","South Orange","Maplewood","Livingston","Millburn","Short Hills","Clifton","Passaic","Paterson","Hackensack","Teaneck","Fort Lee","Edgewater","Englewood","Ridgewood","Paramus","Bergenfield","Fair Lawn","Rutherford","East Rutherford","Lyndhurst"].forEach((n,i)=>add(n,"city",{ county:i<8?"Hudson County":i<15?"Union County":i<25?"Essex County":i<28?"Passaic County":"Bergen County", region:"Northern New Jersey", state:"NJ"},40.73+i*0.004,-74.05+i*0.002));
["Fairfield County","Downtown Stamford","Norwalk","South Norwalk","SoNo","Greenwich","Old Greenwich","Cos Cob","Riverside","Darien","New Canaan","Westport","Fairfield","Bridgeport","Stratford","Trumbull","Shelton","Milford","New Haven","Hamden","West Haven"].forEach((n,i)=>add(n,i===0?"county":"city",{ county:i<18?"Fairfield County":"New Haven County", region:"Connecticut", state:"CT"},41.05+i*0.006,-73.54+i*0.015,n==="SoNo"?["south norwalk"]:[]));

export const GEO_TAXONOMY = base;
const norm = (s: string) => s.toLowerCase().replace(/[’']/g,"'").replace(/\s+/g," ").trim();
export function normalizeGeoTerm(input?: string | null) { if (!input) return null; const n = norm(input); return GEO_TAXONOMY.find((g)=>[g.name,...g.aliases].some((a)=>norm(a)===n)) ?? null; }
export function detectGeoIntent(query: string): GeoIntent {
  const q = ` ${norm(query)} `;
  const priority = (g: GeoTaxonomyRecord) => g.type === "neighborhood" ? 5 : g.type === "city" ? 4 : g.type === "borough" ? 3 : g.type === "county" ? 2 : g.type === "region" ? 1 : 0;
  const sorted = [...GEO_TAXONOMY].sort((a,b)=> (Math.max(...b.aliases.map(x=>x.length),b.name.length)-Math.max(...a.aliases.map(x=>x.length),a.name.length)) || priority(b)-priority(a));
  const hit = sorted.find((g)=>[g.name,...g.aliases].some((a)=>new RegExp(`(^|[^a-z0-9])${norm(a).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}([^a-z0-9]|$)`).test(q)));
  if (!hit) return { raw: null, aliases: [], latitude: null, longitude: null, radiusMiles: null, geoStrictness: "none" };
  return { raw: hit.name, neighborhood: hit.type==="neighborhood"?hit.name:null, city: hit.city ?? (hit.type==="city"?hit.name:null), borough: hit.borough ?? (hit.type==="borough"?hit.name:null), county: hit.county ?? (hit.type==="county"?hit.name:null), region: hit.region ?? (hit.type==="region"?hit.name:null), state: hit.state, aliases: getGeoAliases(hit), latitude: hit.latitude, longitude: hit.longitude, radiusMiles: hit.defaultRadiusMiles, geoStrictness: hit.type==="neighborhood"||hit.type==="city"?"strict":"medium" };
}
export function getGeoAliases(geo: GeoIntent | GeoTaxonomyRecord) { const rec = "geoStrictness" in geo ? normalizeGeoTerm(geo.raw ?? geo.neighborhood ?? geo.city ?? geo.borough ?? geo.county ?? geo.region ?? geo.state ?? "") : geo; return rec ? Array.from(new Set([rec.name, ...rec.aliases, rec.type === "neighborhood" ? rec.name : undefined, rec.borough, rec.city, rec.county, rec.region, rec.state].filter(Boolean) as string[])) : []; }
export function getGeoCenter(geo: GeoIntent) { return geo.latitude != null && geo.longitude != null ? { latitude: geo.latitude, longitude: geo.longitude } : null; }
function eq(a?: unknown,b?: unknown){ return Boolean(a&&b&&norm(String(a))===norm(String(b))); }
export function isSameGeoFamily(record: EnterpriseLocation, geo: GeoIntent) { if (!geo.raw) return true; if (geo.state && record.state && !eq(record.state, geo.state)) return false; if (geo.neighborhood && eq(record.neighborhood, geo.neighborhood)) return true; if (geo.borough && eq(record.borough, geo.borough)) return true; if (geo.city && eq(record.city, geo.city)) return true; if (geo.region==="Long Island") return record.state==="NY" && ["nassau","suffolk"].some(t=>norm([record.city,record.borough,record.neighborhood,record.address,record.search_document].join(" ")).includes(t)); return true; }
export function scoreGeoMatch(record: EnterpriseLocation, geo: GeoIntent) {
  if (!geo.raw) return 0;
  if (geo.state && record.state && !eq(record.state, geo.state)) return -200;
  if (geo.neighborhood && eq(record.neighborhood, geo.neighborhood)) return 130;
  if (geo.borough) {
    if (eq(record.borough, geo.borough)) return 125;
    if (record.borough && geo.city && eq(record.city, geo.city)) {
      return geo.geoStrictness === "strict" ? -90 : -70;
    }
  }
  if (geo.city && eq(record.city, geo.city)) return 80;
  const text = norm([record.neighborhood,record.borough,record.city,record.state,record.address,record.search_document].join(" "));
  if (getGeoAliases(geo).some(a=>text.includes(norm(a)))) return geo.borough ? 95 : 60;
  if (geo.county && text.includes(norm(geo.county))) return 55;
  if (geo.region==="Long Island" && record.state==="NY" && /(nassau|suffolk|hempstead|huntington|garden city|mineola|long beach)/.test(text)) return 70;
  return geo.geoStrictness==="strict" ? -60 : -20;
}
export function shouldExcludeByGeo(record: EnterpriseLocation, geo: GeoIntent) { if (!geo.raw) return false; const score = scoreGeoMatch(record, geo); if (geo.state && record.state && !eq(record.state, geo.state)) return true; if (geo.region==="Long Island" && /long island city|\blic\b|queens/.test(norm([record.neighborhood,record.borough,record.city].join(" ")))) return true; return geo.geoStrictness==="strict" && score < -100; }

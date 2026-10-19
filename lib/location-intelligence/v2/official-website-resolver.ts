import { fetchCorroboratingOfficialPages } from "./official-page-corroboration";
import "server-only";
import { fetchOfficialWebsiteContext } from "@/lib/location-intelligence/v2/source-executors";
import type { IndependentBusinessProfile } from "./independent-profile-gate";

/**
 * Official website is an independent factual source, not a grant to republish its images.
 * Only an explicit source-scoped image grant can qualify a photo for publication.
 */
export type PhotoGrant = {
  websiteOrigin: string;
  imageUrl: string;
  permission: "owner" | "licensed" | "public_domain";
  evidenceUrl: string;
  verifiedBy: string;
  expiresAt?: string;
};
type WebsiteEvidence = IndependentBusinessProfile & {
  website: string;
  category: string;
  locationType: "restaurant" | "activity";
  zip?: string;
  phone?: string;
  openingHours?: string[];
  amenities?: Record<string,boolean>;
};
const clean=(v:unknown)=>typeof v==="string"?v.trim():"";
function plain(v:unknown):Record<string,unknown> {
 return v && typeof v==="object" && !Array.isArray(v)?v as Record<string,unknown>:{};
}
function graphs(value:unknown):Record<string,unknown>[] {
 if(Array.isArray(value))return value.flatMap(graphs);
 const obj=plain(value);
 if(!Object.keys(obj).length)return [];
 return [obj,...graphs(obj["@graph"])];
}
export function parseOfficialBusinessJsonLd(html:string,website:string):Omit<WebsiteEvidence,"latitude"|"longitude"|"photoUrl"|"photoPermission">|null {
 const nodes:Record<string,unknown>[]=[];
 const pattern=/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
 for(const match of html.matchAll(pattern)){
   try {nodes.push(...graphs(JSON.parse(match[1])));}catch{/* malformed scripts are not evidence */}
 }
 const allowedTypes=new Set(["LocalBusiness","Restaurant","FoodEstablishment","BarOrPub","CafeOrCoffeeShop","NightClub","TouristAttraction","EntertainmentBusiness"]);
 const siteOrigin=new URL(website).origin;
 for(const node of nodes){
   const types=Array.isArray(node["@type"])?node["@type"]:[node["@type"]];
   const recognized=types.some(t=>allowedTypes.has(String(t).split("/").pop()||""));
   if(!recognized)continue;
   const address=plain(node.address);
   const name=clean(node.name),street=clean(address.streetAddress),city=clean(address.addressLocality),
     region=clean(address.addressRegion),zip=clean(address.postalCode);
   if(!name||!street||!city||!region)continue;
   const websiteValue=clean(node.url);
   if(websiteValue){
     try{if(new URL(websiteValue).origin!==siteOrigin)continue;}catch{continue;}
   }
   const hours=Array.isArray(node.openingHours)?node.openingHours.filter((x):x is string=>typeof x==="string").slice(0,21):
     (clean(node.openingHours)?[clean(node.openingHours)]:[]);
   const status=hours.length||node.openingHoursSpecification?"open":"unknown";
   const phone=clean(node.telephone);
   const amenities:Record<string,boolean>={};
   for(const feature of (Array.isArray(node.amenityFeature)?node.amenityFeature:[])){
     const f=plain(feature),key=clean(f.name).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,50);
     if(key && typeof f.value==="boolean")amenities[key]=f.value;
   }
   return {name,address:street,city,state:region,zip,sourceUrl:website,website,
      ...(phone?{phone}:{}),openingHours:hours,amenities,
      evidenceSource:"official_website",openStatus:status,
      category:types.some(t=>/restaurant|food|cafe|bar/i.test(String(t)))?"restaurant":"activity",
      locationType:types.some(t=>/restaurant|food|cafe|bar/i.test(String(t)))?"restaurant":"activity"};
 }
 return null;
}
/** Only role-based contact mailboxes actually visible on the official page. */
export function extractOfficialBusinessEmail(html:string,sourceUrl:string) {
 try {
  const url=new URL(sourceUrl);
  if(url.protocol!=="https:")return null;
  const match=[...html.matchAll(/(?:mailto:|\\b)([a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,})/gi)]
   .map(x=>x[1].toLowerCase())
   .find(e=>/^(info|contact|hello|reservations|booking|inquiries|office|general|support)@/.test(e) && e.length<=254);
  return match?{email:match,sourceUrl:url.toString()}:null;
 }catch{return null;}
}
export function permittedOfficialPhoto(grant:PhotoGrant|undefined,website:string,now=Date.now()) {
 if(!grant||!grant.verifiedBy.trim())return null;
 try {
   if(new URL(grant.websiteOrigin).origin!==new URL(website).origin)return null;
   if(new URL(grant.imageUrl).protocol!=="https:"||new URL(grant.evidenceUrl).protocol!=="https:")return null;
   if(grant.expiresAt&&Date.parse(grant.expiresAt)<=now)return null;
   return {photoUrl:grant.imageUrl,photoPermission:grant.permission,photoEvidenceUrl:grant.evidenceUrl};
 }catch{return null;}
}
/** Image references are discovery metadata only, never a license to display or store the image. */
export function extractOfficialImageReferences(html:string,pageUrl:string) {
 const references:{imageUrl:string;sourcePageUrl:string;kind:string}[]=[];
 const add=(raw:unknown,kind:string)=>{
  if(typeof raw!=="string")return;
  try{const u=new URL(raw,pageUrl);if(u.protocol!=="https:"||u.username||u.password)return;
   if(!references.some(x=>x.imageUrl===u.href))references.push({imageUrl:u.href,sourcePageUrl:pageUrl,kind});
  }catch{/* ignore malformed image URL */}
 };
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
  const tag=m[0];
  if(!/(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i.test(tag))continue;
  const url=tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];add(url,"social_meta");
 }
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
  try{for(const node of graphs(JSON.parse(m[1]))){
   const img=node.image;
   for(const value of Array.isArray(img)?img:[img]) add(typeof value==="string"?value:plain(value).url,"json_ld");
  }}catch{/* untrusted structured data */}
 }
 return references.slice(0,30);
}
/**
 * Website lead must be independently re-fetched. Coordinates are verified later
 * via Census -> Geoapify; photos must carry explicit grant provenance.
 */
export async function resolveOfficialWebsiteLead(website:string,photoGrant?:PhotoGrant) {
 const context=await fetchOfficialWebsiteContext(website);
 const structured=parseOfficialBusinessJsonLd(context.html,context.url);
 const corroborated=structured?null:await fetchCorroboratingOfficialPages(context);
 const candidate=structured || corroborated;
 if(!candidate)return {status:"needs_independent_evidence" as const,reason:"official_business_corroboration_missing"};
 const contact=extractOfficialBusinessEmail(context.html,context.url);
 const enriched={...candidate,officialImageReferences:extractOfficialImageReferences(context.html,context.url),...(contact?{businessEmail:contact.email,businessEmailSourceUrl:contact.sourceUrl}:{})};
 const photo=permittedOfficialPhoto(photoGrant,context.url);
 if(!photo)return {status:"photo_pending" as const,candidate:enriched};
 return {status:"verified_evidence" as const,candidate:{...enriched,...photo},
   photoGrant: {evidenceUrl:photo.photoEvidenceUrl,verifiedBy:photoGrant!.verifiedBy}};
}

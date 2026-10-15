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
 const pattern=/<script\\b[^>]*type\\s*=\\s*["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script\\s*>/gi;
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
   const status=clean(node.openingHours)||node.openingHoursSpecification?"open":"unknown";
   return {name,address:street,city,state:region,zip,sourceUrl:website,website,
      evidenceSource:"official_website",openStatus:status,
      category:types.some(t=>/restaurant|food|cafe|bar/i.test(String(t)))?"restaurant":"activity",
      locationType:types.some(t=>/restaurant|food|cafe|bar/i.test(String(t)))?"restaurant":"activity"};
 }
 return null;
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
/**
 * Website lead must be independently re-fetched. Coordinates are verified later
 * via Census -> Geoapify; photos must carry explicit grant provenance.
 */
export async function resolveOfficialWebsiteLead(website:string,photoGrant?:PhotoGrant) {
 const context=await fetchOfficialWebsiteContext(website);
 const candidate=parseOfficialBusinessJsonLd(context.html,context.url);
 if(!candidate)return {status:"needs_independent_evidence" as const,reason:"official_structured_business_missing"};
 const photo=permittedOfficialPhoto(photoGrant,context.url);
 if(!photo)return {status:"needs_photo_permission" as const,candidate};
 return {status:"verified_evidence" as const,candidate:{...candidate,...photo},
   photoGrant: {evidenceUrl:photo.photoEvidenceUrl,verifiedBy:photoGrant!.verifiedBy}};
}

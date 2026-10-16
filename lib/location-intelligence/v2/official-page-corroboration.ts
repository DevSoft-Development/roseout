import "server-only";
import { fetchOfficialWebsiteContext } from "./source-executors";

/** Only independently fetched, same-origin first-party pages count as corroboration.
 * A provider-supplied name or address is deliberately never used as proof.
 */
type Page={url:string;html:string;text:string;title:string};
const clean=(s:string)=>s.replace(/\s+/g," ").trim();
const normalize=(s:string)=>clean(s.toLowerCase().replace(/&amp;/g,"&").replace(/[^a-z0-9 ]/g," "));
const STREET=/\b(\d{1,6}\s+(?:(?:[a-z0-9]+|[a-z0-9]+[.])\s+){1,5}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|place|pl|court|ct|way|parkway|pkwy|broadway))\b/i;
const CITY_STATE_ZIP=/\b([a-z][a-z .'-]{2,38})\s*,\s*([a-z]{2})\s+(\d{5})(?:-\d{4})?\b/i;
const CLOSED=/\b(permanently closed|closed permanently|we have closed|ceased operations)\b/i;
const HOURS=/\b(?:opening hours|business hours|hours of operation|our hours)\b/i;
const RESTAURANT=/\b(?:restaurant|cafe|coffee shop|dining|bistro|pizzeria|menu|eatery)\b/i;
function text(html:string){return clean(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&"));}
export function pageBusinessEvidence(page:Page){
 const content=text(page.html);
 const title=clean(page.html.match(/<meta\s+[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1]||page.title.split(/\s+[|–—-]\s+/)[0]||"");
 const street=content.match(STREET)?.[1]||"";
 const afterStreet=street?content.slice(content.toLowerCase().indexOf(street.toLowerCase())+street.length,content.toLowerCase().indexOf(street.toLowerCase())+street.length+130):"";
 const locality=afterStreet.match(CITY_STATE_ZIP);
 return {name:title,visibleText:normalize(content),street,city:locality?.[1]?.trim()||"",state:locality?.[2]?.toUpperCase()||"",zip:locality?.[3]||"",
  restaurant:RESTAURANT.test(content),hours:HOURS.test(content),closed:CLOSED.test(content),url:page.url};
}
export function corroborateOfficialPages(pages:Page[]){
 if(pages.length<2)return null;
 const extracted=pages.map(pageBusinessEvidence);
 for(let i=0;i<extracted.length;i++)for(let j=i+1;j<extracted.length;j++){
  const a=extracted[i],b=extracted[j];
  if(!a.name||!a.street||!a.city||!a.state||!a.zip || !b.name||!b.street||!b.city||!b.state||!b.zip)continue;
  if(normalize(a.name).length<5 || !a.visibleText.includes(normalize(a.name)) || !b.visibleText.includes(normalize(a.name)) ||\n    (normalize(b.name)!==normalize(a.name) && !normalize(b.name).includes(normalize(a.name)) && !normalize(a.name).includes(normalize(b.name)))continue;\n  if(normalize(a.street)!==normalize(b.street)||
    normalize(a.city)!==normalize(b.city)||a.state!==b.state||a.zip!==b.zip)continue;
  if(!a.restaurant&&!b.restaurant)continue;
  if(a.closed||b.closed)continue;
  // Published operating status must have explicit first-party hours evidence.
  return {name:a.name,address:a.street,city:a.city,state:a.state,zip:a.zip,
   category:"restaurant" as const,locationType:"restaurant" as const,
   openStatus:(a.hours||b.hours?"open":"unknown") as "open"|"unknown",
   sourceUrl:a.url,website:new URL(a.url).origin,evidenceSource:"official_website" as const,
   officialEvidenceUrls:[a.url,b.url]};
 }
 return null;
}
export async function fetchCorroboratingOfficialPages(home:Page){
 const origin=new URL(home.url).origin;
 const pages:Page[]=[home];
 // Fixed, bounded same-origin paths, no extracted link following or third-party domains.
 for(const path of ["/contact","/locations","/about","/hours"]){
  try{
   const page=await fetchOfficialWebsiteContext(origin+path);
   const url=new URL(page.url);
   if(url.origin!==origin || !["https:"].includes(url.protocol))continue;
   pages.push(page);
   const result=corroborateOfficialPages(pages);
   if(result)return result;
  }catch{/* inaccessible official pages do not create business evidence */}
 }
 return null;
}

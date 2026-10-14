/** Parse explicit Schema.org MenuItem facts only; do not infer prices or allergens. */
export type CrawledMenuFact = {
 name: string; price: number | null; currency: string | null;
 category: string | null; sourceUrl: string; sourceType: "official_jsonld" | "official_microdata";
};
function objects(value: unknown, depth=0): Record<string,unknown>[] {
 if (depth>12 || !value || typeof value!=="object") return [];
 if (Array.isArray(value)) return value.flatMap(x=>objects(x,depth+1));
 const obj=value as Record<string,unknown>;
 return [obj,...Object.values(obj).flatMap(x=>objects(x,depth+1))];
}
function types(x: unknown): string[] {
 return (Array.isArray(x)?x:[x]).filter((v):v is string=>typeof v==="string").map(v=>v.toLowerCase().split("/").pop()||"");
}
function priceOf(offers: unknown): {price:number|null;currency:string|null} {
 for(const offer of objects(offers).slice(0,10)) {
   const raw=offer.price ?? offer.lowPrice;
   if(raw===undefined || raw===null) continue;
   const normalized=String(raw).trim();
   if(!/^[0-9]{1,5}(?:\.[0-9]{1,2})?$/.test(normalized)) continue;
   const price=Number(normalized);
   if(!Number.isFinite(price)) continue;
   const currency=typeof offer.priceCurrency==="string" ? offer.priceCurrency.trim().toUpperCase():null;
   return {price,currency:/^[A-Z]{3}$/.test(currency||"")?currency:null};
 }
 return {price:null,currency:null};
}
export function extractOfficialJsonLdMenuFacts(html:string, sourceUrl:string): CrawledMenuFact[] {
 const url=new URL(sourceUrl);
 if(!["https:","http:"].includes(url.protocol)) throw new Error("invalid_menu_source");
 const results: CrawledMenuFact[]=[];
 for (const match of html.slice(0,1_000_000).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
   let parsed:unknown;
   try {parsed=JSON.parse(match[1]);}catch{continue;}
   for(const obj of objects(parsed).slice(0,2000)) {
     if(!types(obj["@type"]).includes("menuitem") || typeof obj.name!=="string") continue;
     const name=obj.name.replace(/\s+/g," ").trim().slice(0,160);
     if(!name) continue;
     const {price,currency}=priceOf(obj.offers);
     results.push({name,price,currency,category:typeof obj.category==="string"?obj.category.slice(0,120):null,sourceUrl:url.toString(),sourceType:"official_jsonld"});
     if(results.length>=300) return results;
   }
 }
 return [...new Map(results.map(x=>[x.name.toLowerCase(),x])).values()];
}

/** Extract only explicit schema.org MenuItem microdata. No inferred menu dishes. */
export function extractOfficialMicrodataMenuFacts(html: string, sourceUrl: string): CrawledMenuFact[] {
 const url = new URL(sourceUrl);
 if (!["https:", "http:"].includes(url.protocol)) throw new Error("invalid_menu_source");
 const facts: CrawledMenuFact[] = [];
 const blocks = html.slice(0, 1_000_000).matchAll(/<([a-z][\w:-]*)\b(?=[^>]*\bitemscope\b)(?=[^>]*\bitemtype\s*=\s*["'][^"']*schema\.org\/MenuItem["'])[^>]*>([\s\S]*?)<\/\1>/gi);
 for (const match of blocks) {
  const body = match[2];
  const nameTag = body.match(/<[^>]+\bitemprop\s*=\s*["']name["'][^>]*>/i);
  if (!nameTag) continue;
  const attr = nameTag[0].match(/\bcontent\s*=\s*["']([^"']+)["']/i);
  const tail = body.slice((nameTag.index ?? 0) + nameTag[0].length);
  const plain = tail.split(/<\//, 1)[0].replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const name = (attr?.[1] ?? plain).replace(/\s+/g, " ").trim().slice(0, 160);
  if (!name || /[<>]/.test(name)) continue;
  facts.push({name,price:null,currency:null,category:null,sourceUrl:url.toString(),sourceType:"official_microdata"});
  if(facts.length>=100) break;
 }
 return [...new Map(facts.map(x=>[x.name.toLowerCase(),x])).values()];
}

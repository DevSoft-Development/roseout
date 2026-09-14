import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteV3ConceptId } from "@/lib/websites/v3/catalog";

function haystack(location:GeneratedWebsiteLocationSnapshot,extra?:Record<string,unknown>){return [location.name,location.title,location.short_description,location.description,...location.best_for,...location.special_features,extra?.location_type,extra?.activity_type,extra?.cuisine,extra?.category,extra?.subcategory].filter(Boolean).join(" ").toLowerCase()}
const hit=(h:string,words:string[])=>words.some(w=>h.includes(w));
export function recommendWebsiteV3Concept(location:GeneratedWebsiteLocationSnapshot,extra?:Record<string,unknown>):WebsiteV3ConceptId{
 const h=haystack(location,extra);
 if(hit(h,["spa","wellness","massage","sauna","facial","meditation"]))return "sanctuary";
 if(hit(h,["bakery","cafe","coffee","patisserie","breakfast"]))return "daylight";
 if(hit(h,["brewery","distillery","taproom","industrial","craft beer"]))return "foundry";
 if(hit(h,["supper club","cabaret","live music","jazz","crooner"]))return "supper_club";
 if(hit(h,["immersive","mini golf","arcade","bowling","family entertainment","game venue"]))return "electric_garden";
 if(hit(h,["rooftop","skyline","terrace","penthouse"]))return "skyline";
 if(hit(h,["steak","barbecue","bbq","wood-fired","whiskey"]))return "ember";
 if(hit(h,["cocktail","speakeasy","lounge","nightclub","late-night"]))return "velvet_room";
 if(hit(h,["museum","gallery","theater","art","chef-driven","tasting menu"]))return "atelier";
 if(hit(h,["seafood","mediterranean","coastal","beach"]))return "riviera";
 if(hit(h,["garden","botanical","brunch","greenhouse"]))return "botanica";
 if(hit(h,["sports bar","sports","watch party"]))return "grandstand";
 if(hit(h,["food hall","fast casual","casual","counter service"]))return "market_hall";
 if(hit(h,["private dining","intimate","fine dining","luxury"]))return "quiet_luxury";
 return hit(h,["karaoke","group","birthday","social"]) ? "social_house" : "maison";
}
export const WEBSITE_V3_ALTERNATE_DIRECTIONS:WebsiteV3ConceptId[]=["maison","nocturne","atelier","vista","social_house","quiet_luxury","botanica","ember","velvet_room","skyline","riviera","gallery_house","pulse","market_hall","grandstand","daylight","foundry","supper_club","sanctuary","electric_garden"];
export function nextWebsiteV3Direction(current:WebsiteV3ConceptId,recommended:WebsiteV3ConceptId){const list=[recommended,...WEBSITE_V3_ALTERNATE_DIRECTIONS.filter(x=>x!==recommended)];const i=list.indexOf(current);return list[(i+1+list.length)%list.length]}

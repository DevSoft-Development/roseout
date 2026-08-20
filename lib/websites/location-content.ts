import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationMenu } from "@/lib/locations/menu";

export type GeneratedWebsiteMenuItem = { name:string; description?:string|null; price?:string|null; image_url?:string|null; section?:string|null };
export type GeneratedWebsiteReview = { customer_name:string; rating:number; review_text:string };
export type GeneratedWebsiteEvent = { id:string; slug:string|null; title:string; description:string|null; category:string|null; starts_at:string; image_url:string|null; is_free:boolean; price_min:number|null };
export type GeneratedWebsiteExperience = { id:string; slug:string|null; title:string; description:string|null; category:string|null; image_url:string|null; duration_minutes:number; price_per_person:number };
export type GeneratedWebsiteLocationSnapshot = {
  id:string; name?:string|null; title?:string|null; address?:string|null; phone?:string|null; hours?:string|null; reservation_link?:string|null; image_url?:string|null; photos:string[];
  menu:{ title:string; description?:string|null; external_url?:string|null; pdf_url?:string|null; items:GeneratedWebsiteMenuItem[] }|null;
  reviews:GeneratedWebsiteReview[];
  events:GeneratedWebsiteEvent[];
  experiences:GeneratedWebsiteExperience[];
};

function stringValue(value:unknown){return typeof value==="string"&&value.trim()?value.trim():null}
function objectValue(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{} }
function uniqueUrls(values:unknown[]){const urls:string[]=[];for(const value of values){if(Array.isArray(value)){for(const nested of value){const candidate=typeof nested==="string"?nested:stringValue(objectValue(nested).url)||stringValue(objectValue(nested).image_url);if(candidate&&/^https?:\/\//i.test(candidate)&&!urls.includes(candidate))urls.push(candidate)}continue}const candidate=stringValue(value);if(candidate&&/^https?:\/\//i.test(candidate)&&!urls.includes(candidate))urls.push(candidate)}return urls.slice(0,12)}
export function formatWebsiteHours(value:unknown):string|null{if(typeof value==="string"&&value.trim())return value.trim();if(Array.isArray(value)){const lines=value.map(entry=>typeof entry==="string"?entry.trim():"").filter(Boolean);return lines.length?lines.join("\n"):null}const record=objectValue(value);const entries=Object.entries(record).filter(([,hours])=>hours!=null&&String(hours).trim()).map(([day,hours])=>`${day.replace(/_/g," ").replace(/\b\w/g,letter=>letter.toUpperCase())}: ${String(hours).trim()}`);return entries.length?entries.join("\n"):null}

export async function getGeneratedWebsiteLocationSnapshot(location:Record<string,unknown>):Promise<GeneratedWebsiteLocationSnapshot>{
  const metadata=objectValue(location.metadata);const id=stringValue(location.id)||"";const photos=uniqueUrls([location.image_url,location.main_image,location.photo_url,location.images,location.photos,metadata.image_url,metadata.main_image,metadata.images,metadata.photos]);
  let menu:GeneratedWebsiteLocationSnapshot["menu"]=null;
  try{const menuData=id?await getLocationMenu(id):null;const page=menuData?.page;if(page&&(page.status==="published"||page.is_active===true)){const sectionNames=new Map((menuData.sections||[]).map(section=>[String(section.id),String(section.title||section.name||"Menu")]));menu={title:String(page.title||"Menu"),description:stringValue(page.description),external_url:stringValue(page.external_url),pdf_url:stringValue(page.pdf_url),items:(menuData.items||[]).filter(item=>item.is_available!==false).slice(0,24).map(item=>({name:String(item.name||"Menu item"),description:stringValue(item.description),price:stringValue(item.price_label)||stringValue(item.price),image_url:stringValue(item.image_url),section:sectionNames.get(String(item.section_id))||null}))}}}catch(error){console.error("GENERATED_WEBSITE_MENU_LOAD_FAILED",{locationId:id,error})}
  let reviews:GeneratedWebsiteReview[]=[];
  try{if(id){const{data}=await supabaseAdmin.from("location_reviews").select("customer_name,rating,review_text").eq("location_id",id).eq("status","approved").eq("verified_visit",true).order("created_at",{ascending:false}).limit(6);reviews=(data||[]).filter(review=>stringValue(review.review_text)).map(review=>({customer_name:stringValue(review.customer_name)||"TheOutHaven Guest",rating:Math.min(5,Math.max(1,Number(review.rating||5))),review_text:stringValue(review.review_text)||""}))}}catch(error){console.error("GENERATED_WEBSITE_REVIEWS_LOAD_FAILED",{locationId:id,error})}
  let events:GeneratedWebsiteEvent[]=[];let experiences:GeneratedWebsiteExperience[]=[];
  try{if(id){const[{data:eventRows},{data:experienceRows}]=await Promise.all([
    supabaseAdmin.from("events").select("id,slug,title,description,category,starts_at,image_url,is_free,price_min").eq("location_id",id).eq("searchable",true).in("status",["scheduled","postponed"]).gte("starts_at",new Date().toISOString()).order("starts_at",{ascending:true}).limit(6),
    supabaseAdmin.from("experiences").select("id,slug,title,description,category,image_url,duration_minutes,price_per_person").eq("location_id",id).eq("searchable",true).eq("status","published").order("created_at",{ascending:false}).limit(6),
  ]);events=(eventRows||[]).map(row=>({id:String(row.id),slug:stringValue(row.slug),title:String(row.title||"Event"),description:stringValue(row.description),category:stringValue(row.category),starts_at:String(row.starts_at),image_url:stringValue(row.image_url),is_free:Boolean(row.is_free),price_min:row.price_min==null?null:Number(row.price_min)}));experiences=(experienceRows||[]).map(row=>({id:String(row.id),slug:stringValue(row.slug),title:String(row.title||"Experience"),description:stringValue(row.description),category:stringValue(row.category),image_url:stringValue(row.image_url),duration_minutes:Number(row.duration_minutes||60),price_per_person:Number(row.price_per_person||0)}))}}catch(error){console.error("GENERATED_WEBSITE_OFFERINGS_LOAD_FAILED",{locationId:id,error})}
  return {id,name:stringValue(location.name)||stringValue(location.restaurant_name)||stringValue(location.activity_name)||stringValue(location.location_name),title:stringValue(location.title),address:stringValue(location.address)||stringValue(location.formatted_address),phone:stringValue(location.phone)||stringValue(location.phone_number),hours:formatWebsiteHours(location.hours??location.opening_hours??location.business_hours??metadata.hours??metadata.opening_hours),reservation_link:stringValue(location.reservation_link),image_url:photos[0]||null,photos,menu,reviews,events,experiences};
}

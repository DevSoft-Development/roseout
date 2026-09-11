import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";
import type { BusinessWebsite } from "@/lib/websites/data";

async function getUser(){const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();return user}

export async function GET(request:Request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:"Please log in to continue."},{status:401});
  const locationId=new URL(request.url).searchParams.get("location_id")?.trim()||"";
  if(!locationId)return NextResponse.json({error:"Missing location."},{status:400});
  const location=await getAuthorizedWebsiteLocation(user,locationId,"*");
  if(!location)return NextResponse.json({error:"Location not found."},{status:404});
  const {data:website,error}=await supabaseAdmin.from("business_websites").select("*").eq("location_id",locationId).maybeSingle();
  if(error)throw error;
  if(!website)return NextResponse.json({error:"Website not found."},{status:404});
  const content=await getGeneratedWebsiteLocationSnapshot(location as Record<string,unknown>);
  const typed=website as BusinessWebsite;
  const liveUrl=getWebsiteLiveUrl(typed);
  const checks=[
    {key:"published",label:"Website published",ok:Boolean(typed.published_version&&liveUrl),weight:18},
    {key:"domain",label:"Website address ready",ok:Boolean(typed.domain||typed.platform_domain),weight:12},
    {key:"ssl",label:"SSL ready",ok:String((website as any).ssl_status||"").toLowerCase()==="active"||Boolean(liveUrl?.startsWith("https://")),weight:10},
    {key:"photos",label:"Quality imagery connected",ok:content.photos.length>=3,weight:12},
    {key:"hours",label:"Business hours connected",ok:Boolean(content.hours),weight:10},
    {key:"menu",label:"Menu connected",ok:Boolean(content.menu),weight:10},
    {key:"reservations",label:"Reservation path ready",ok:Boolean(content.uses_internal_reservations||content.reservation_link),weight:10},
    {key:"events",label:"Events or experiences connected",ok:Boolean(content.events.length||content.experiences.length),weight:6},
    {key:"reviews",label:"Verified reviews connected",ok:content.reviews.length>0,weight:6},
    {key:"content",label:"Business description ready",ok:Boolean((location as any).description||(location as any).short_description),weight:6},
  ];
  const score=checks.reduce((sum,check)=>sum+(check.ok?check.weight:0),0);
  return NextResponse.json({ok:true,score,live_url:liveUrl,checks,healthy:score>=85});
}

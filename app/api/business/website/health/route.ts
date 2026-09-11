import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";
import { checkHostedWebsiteLiveHealth } from "@/lib/websites/live-health";
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
  const live=await checkHostedWebsiteLiveHealth({liveUrl,reservationUrl:content.uses_internal_reservations?null:content.reservation_link});
  const checks=[
    {key:"published",label:"Website published",ok:Boolean(typed.published_version&&liveUrl),weight:12},
    {key:"live",label:"Live website reachable",ok:Boolean(live.site?.ok),weight:14},
    {key:"domain",label:"Website address ready",ok:Boolean(typed.domain||typed.platform_domain),weight:8},
    {key:"ssl",label:"SSL ready",ok:String((website as any).ssl_status||"").toLowerCase()==="active"||Boolean(liveUrl?.startsWith("https://")),weight:8},
    {key:"seo",label:"Sitemap and robots reachable",ok:Boolean(live.sitemap?.ok&&live.robots?.ok),weight:8},
    {key:"photos",label:"Quality imagery connected",ok:content.photos.length>=3,weight:10},
    {key:"hours",label:"Business hours connected",ok:Boolean(content.hours),weight:8},
    {key:"menu",label:"Menu connected",ok:Boolean(content.menu),weight:8},
    {key:"reservations",label:"Reservation path ready",ok:Boolean(content.uses_internal_reservations||content.reservation_link),weight:8},
    {key:"reservation_live",label:"Reservation link reachable",ok:content.uses_internal_reservations||!content.reservation_link||Boolean(live.reservation?.ok),weight:6},
    {key:"events",label:"Events or experiences connected",ok:Boolean(content.events.length||content.experiences.length),weight:4},
    {key:"reviews",label:"Verified reviews connected",ok:content.reviews.length>0,weight:3},
    {key:"content",label:"Business description ready",ok:Boolean((location as any).description||(location as any).short_description),weight:3},
  ];
  const score=checks.reduce((sum,check)=>sum+(check.ok?check.weight:0),0);
  return NextResponse.json({ok:true,score,live_url:liveUrl,checks,healthy:score>=85&&Boolean(live.site?.ok),live});
}

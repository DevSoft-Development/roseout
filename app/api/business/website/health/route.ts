import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";
import { checkHostedWebsiteLiveHealth } from "@/lib/websites/live-health";
import type { BusinessWebsite } from "@/lib/websites/data";

async function getUser(){const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();return user}

async function inspectSeoDocument(liveUrl:string|null){
  if(!liveUrl)return {title:false,description:false,localBusiness:false,event:false,offer:false,review:false};
  try{
    const response=await fetch(liveUrl,{cache:"no-store",redirect:"follow",signal:AbortSignal.timeout(8000),headers:{"user-agent":"TheOutHaven-VisibilityHealth/1.0"}});
    if(!response.ok)return {title:false,description:false,localBusiness:false,event:false,offer:false,review:false};
    const html=(await response.text()).slice(0,2_000_000);
    const title=/<title[^>]*>\s*[^<]{2,}\s*<\/title>/i.test(html);
    const description=/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}["']/i.test(html)||/<meta[^>]+content=["'][^"']{20,}["'][^>]+name=["']description["']/i.test(html);
    const jsonLd=(html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[]).join("\n");
    return {
      title,
      description,
      localBusiness:/["']@type["']\s*:\s*["'](?:LocalBusiness|Restaurant|FoodEstablishment|EntertainmentBusiness|BarOrPub|CafeOrCoffeeShop)["']/i.test(jsonLd),
      event:/["']@type["']\s*:\s*["']Event["']/i.test(jsonLd),
      offer:/["']@type["']\s*:\s*["']Offer["']/i.test(jsonLd),
      review:/["']@type["']\s*:\s*["'](?:Review|AggregateRating)["']/i.test(jsonLd),
    };
  }catch{
    return {title:false,description:false,localBusiness:false,event:false,offer:false,review:false};
  }
}


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
  const seo=await inspectSeoDocument(liveUrl);
  const checks=[
    {key:"published",label:"Website published",ok:Boolean(typed.published_version&&liveUrl),weight:8},
    {key:"live",label:"Live website reachable",ok:Boolean(live.site?.ok),weight:12},
    {key:"domain",label:"Website address ready",ok:Boolean(typed.domain||typed.platform_domain),weight:5},
    {key:"ssl",label:"SSL ready",ok:String((website as any).ssl_status||"").toLowerCase()==="active"||Boolean(liveUrl?.startsWith("https://")),weight:5},
    {key:"seo_files",label:"Sitemap and robots reachable",ok:Boolean(live.sitemap?.ok&&live.robots?.ok),weight:7},
    {key:"title",label:"Search title present",ok:seo.title,weight:5},
    {key:"meta_description",label:"Meta description present",ok:seo.description,weight:5},
    {key:"local_business_schema",label:"Local business structured data",ok:seo.localBusiness,weight:7},
    {key:"event_schema",label:"Event structured data where applicable",ok:content.events.length===0&&content.experiences.length===0||seo.event,weight:4},
    {key:"offer_schema",label:"Offer structured data where applicable",ok:!content.menu||seo.offer,weight:4},
    {key:"review_schema",label:"Review structured data where appropriate",ok:content.reviews.length===0||seo.review,weight:4},
    {key:"photos",label:"Quality imagery connected",ok:content.photos.length>=3,weight:7},
    {key:"hours",label:"Business hours connected",ok:Boolean(content.hours),weight:5},
    {key:"menu",label:"Menu connected",ok:Boolean(content.menu),weight:5},
    {key:"reservations",label:"Reservation path ready",ok:Boolean(content.uses_internal_reservations||content.reservation_link),weight:5},
    {key:"reservation_live",label:"Reservation link reachable",ok:content.uses_internal_reservations||!content.reservation_link||Boolean(live.reservation?.ok),weight:4},
    {key:"events",label:"Events or experiences connected",ok:Boolean(content.events.length||content.experiences.length),weight:3},
    {key:"reviews",label:"Verified reviews connected",ok:content.reviews.length>0,weight:2},
    {key:"content",label:"Business description ready",ok:Boolean((location as any).description||(location as any).short_description),weight:3},
  ];
  const score=checks.reduce((sum,check)=>sum+(check.ok?check.weight:0),0);
  return NextResponse.json({ok:true,score,live_url:liveUrl,checks,healthy:score>=85&&Boolean(live.site?.ok),live,seo});
}

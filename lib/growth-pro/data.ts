import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { isBusinessPro } from "@/lib/analytics/business-analytics";
import { getLocationQrStatus } from "@/lib/admin/location-qr-status";

export type ChecklistStatus = "complete"|"needs_setup"|"review"|"unavailable";
export type ChecklistItem = { key:string; label:string; status:ChecklistStatus; tone:string; description:string; href:string; actionLabel:string; count?:number };

async function safe<T>(fn:()=>any, fallback:T):Promise<T>{ try{ const {data,error}=await fn(); if(error) { console.warn("Growth Pro query skipped", error.message); return fallback; } return (data ?? fallback) as T; } catch(e){ console.warn("Growth Pro query failed", e); return fallback; } }
export async function getCurrentBusinessLocation(locationId?: string){
  const cookieStore=await cookies(); const impersonatedLocationId=locationId || cookieStore.get("theouthaven_impersonate_location_id")?.value;
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user && !impersonatedLocationId && !cookieStore.get("theouthaven_admin_user_id")?.value) redirect("/login");
  let q=supabaseAdmin.from("locations").select("*").order("id",{ascending:false}).limit(1);
  if(impersonatedLocationId) q=q.eq("id",impersonatedLocationId); else if(user) q=q.or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email||""},claimed_by_email.eq.${user.email||""}`);
  const rows=await safe<any[]>(()=>q,[]); return rows[0] || null;
}
async function many(table:string, locationId:string, cols="*"){ return safe<any[]>(()=>supabaseAdmin.from(table).select(cols).eq("location_id",locationId).order("created_at",{ascending:false}).limit(50),[]); }
async function count(table:string, locationId:string){ try{ const {count,error}=await supabaseAdmin.from(table).select("id",{count:"exact",head:true}).eq("location_id",locationId); return error?0:(count||0);}catch{return 0;} }
export async function getGrowthProLocationContext(locationId:string){
 const location=(await safe<any[]>(()=>supabaseAdmin.from("locations").select("*").eq("id",locationId).limit(1),[]))[0]||null;
 const [branding, commercePages, commerceSections, commerceItems, qrCodes, offers, leads, recipients, prefs, events, suggestions, generations]=await Promise.all([
  many("location_branding_settings",locationId), many("location_commerce_pages",locationId), many("location_commerce_sections",locationId), many("location_commerce_items",locationId), many("location_qr_codes",locationId), many("location_offers",locationId), many("location_leads",locationId), many("location_notification_recipients",locationId), many("location_notification_preferences",locationId), many("location_notification_events",locationId), many("location_marketing_suggestions",locationId), many("location_marketing_generations",locationId)
 ]);
 const [offerClaimsCount,vipCount,qrScans,feedback,reviews,reservations]=await Promise.all([count("location_offer_claims",locationId),count("location_vip_signups",locationId),count("location_qr_scan_events",locationId),count("location_private_feedback",locationId),count("location_reviews",locationId),count("reservations",locationId)]);
 return { location, planStatus:isBusinessPro(location||{})?"active":"locked", branding:branding[0]||{}, offerings:[], commercePages, commerceSections, commerceItems, qrCodes, offers, offerClaimsCount, vipCount, notificationRecipients:recipients, notificationPreferences:prefs, notificationEvents:events, leads, reservationsSummary:{count:reservations}, feedbackSummary:{count:feedback}, reviewSummary:{count:reviews}, marketingSuggestions:suggestions, marketingGenerations:generations, analyticsSummary:{qrScans, offerClaims:offerClaimsCount, vipSignups:vipCount, leads:leads.length, reservations, feedback, reviews, menuViews:0} };
}
export async function getGrowthProChecklist(locationId:string):Promise<ChecklistItem[]>{ const c=await getGrowthProLocationContext(locationId); const has=(b:boolean)=>b?"complete":"needs_setup"; const tab=(t:string)=>`/admin/dashboard/crm/${locationId}?tab=${t}`; const items:any[]=[
 ["owner_connected","Owner connected",!!(c.location?.owner_user_id||c.location?.owner_email),"owner"],["claim_verified","Claim verified",!!(c.location?.is_claimed||c.location?.claimed),"claims"],["growth_pro_active","Growth Pro active",c.planStatus==="active","plan"],["logo_uploaded","Logo uploaded",!!c.branding.logo_url,"branding"],["brand_color_selected","Brand color selected",!!c.branding.brand_accent_color,"branding"],["offerings_selected","Offerings selected",c.offerings.length>0,"offerings"],["menu_packages_added","Menu/packages added",c.commercePages.length+c.commerceItems.length>0,"menu-packages",c.commerceItems.length],["qr_codes_generated","QR codes generated",getLocationQrStatus({ location: c.location || {}, qrCodes: c.qrCodes }).hasQrCode,"qr-codes",c.qrCodes.length],["notification_recipients_added","Notification recipients added",c.notificationRecipients.length>0,"notifications",c.notificationRecipients.length],["reservation_mode_selected","Reservation mode selected",!!c.location?.reservation_mode,"reservations"],["event_lead_form_active","Event lead form active",true,"event-leads",c.leads.length],["offer_created","Offer created",c.offers.length>0,"offers",c.offers.length],["vip_signup_active","VIP signup active",true,"vip-list",c.vipCount],["messaging_configured","Messaging configured",true,"messaging"],["review_feedback_qr_active","Review/feedback QR active",c.qrCodes.some((q:any)=>String(q.qr_type||q.type).includes("review")),"reviews-feedback"],["suggested_monthly_ideas_generated","Suggested Monthly Ideas generated",c.marketingSuggestions.length>0,"marketing-studio",c.marketingSuggestions.length],["analytics_tracking_active","Analytics tracking active",true,"analytics"]];
 return items.map(([key,label,ok,t,count])=>({key,label,status:has(ok) as ChecklistStatus,tone:ok?"good":"setup",description:ok?"Ready for the Growth Pro workflow.":"Needs setup to complete the Growth Pro workflow.",href:tab(t),actionLabel:ok?"Open":"Set up",count})); }
export async function getBusinessGrowthProDashboard(locationId:string){ return getGrowthProLocationContext(locationId); }
export async function getPublicGrowthProProfile(locationId:string){ const c=await getGrowthProLocationContext(locationId); return { name:getLocationName(c.location||{},"This location"), ...c }; }

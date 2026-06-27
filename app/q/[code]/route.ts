import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getClientIpHash } from "@/lib/security/turnstile";
import { trackGrowthProEvent } from "@/lib/growth-pro/analytics";
export async function GET(request: Request,{params}:{params:Promise<{code:string}>}){const {code}=await params; const {data:qr}=await supabaseAdmin.from("location_qr_codes").select("id,location_id,qr_type,destination_path,is_active").eq("code",code).eq("is_active",true).maybeSingle(); if(!qr) redirect("/"); await supabaseAdmin.from("location_qr_scan_events").insert({qr_code_id:qr.id,location_id:qr.location_id,qr_type:qr.qr_type,ip_hash:getClientIpHash(request),user_agent:request.headers.get("user-agent"),referrer:request.headers.get("referer")}).then(undefined,()=>undefined); await trackGrowthProEvent(qr.location_id,`qr_${qr.qr_type || "main"}_scan`,{code}); redirect(qr.destination_path || "/");}

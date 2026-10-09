"use server";

import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase-server";
import {hasLocationPermission,resolveLocationAccessContext} from "@/lib/auth/locationOwnerAccess";
import {supabaseAdmin} from "@/lib/supabase-admin";
import {scheduleFromLocationHours} from "@/lib/pos/hardware/health/operating-hours";

export async function confirmPosMonitoringHours(formData:FormData){
  const locationId=String(formData.get("locationId")||"").trim();
  const timeZone=String(formData.get("timeZone")||"").trim();
  const confirmed=String(formData.get("confirmHours")||"")==="yes";
  if(!locationId||!timeZone||!confirmed)throw new Error("pos_monitor_confirmation_required");
  if(timeZone.length>80)throw new Error("pos_monitor_timezone_invalid");
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error("pos_monitor_auth_required");
  const access=await resolveLocationAccessContext({
    userId:user.id,userEmail:user.email,locationId,
  });
  if(access.canonicalLocationId!==locationId||!hasLocationPermission(access,"hardware.manage"))
    throw new Error("pos_monitor_forbidden");

  const {data:row,error:readError}=await supabaseAdmin.from("locations")
    .select("id,operating_hours,metadata,updated_at")
    .eq("id",locationId).maybeSingle();
  if(readError||!row)throw new Error("pos_monitor_location_unavailable");
  if(!scheduleFromLocationHours(row.operating_hours,timeZone))
    throw new Error("pos_monitor_hours_unusable_review_business_hours");
  const metadata=(row.metadata&&typeof row.metadata==="object"&&!Array.isArray(row.metadata))
    ? row.metadata as Record<string,unknown> : {};
  const {data:updated,error:updateError}=await supabaseAdmin.from("locations")
    .update({
      metadata:{
        ...metadata,
        pos_monitoring_timezone:timeZone,
        pos_monitoring_hours_fingerprint:JSON.stringify(row.operating_hours),
        pos_monitoring_confirmed_at:new Date().toISOString(),
        pos_monitoring_confirmed_by:user.id,
      },
    })
    .eq("id",locationId)
    .eq("updated_at",row.updated_at)
    .select("id").maybeSingle();
  if(updateError||!updated)throw new Error("pos_monitor_concurrent_location_edit_retry");
  revalidatePath("/locations/dashboard/hardware/health");
}

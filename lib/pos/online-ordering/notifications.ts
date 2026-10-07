import "server-only";

import { sendSms } from "@/lib/sms/sendSms";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

type CustomerStatus="received"|"preparing"|"ready";

function statusCopy(status:CustomerStatus,locationName:string,pickupAt:string|null){
  const pickup=pickupAt?new Date(pickupAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):null;
  if(status==="received") return {
    subject:`Order received at ${locationName}`,
    body:`${locationName} received your pickup order.${pickup?` Estimated pickup: ${pickup}.`:""} We'll let you know when it is being prepared and when it is ready.`,
  };
  if(status==="preparing") return {
    subject:`Your ${locationName} order is being prepared`,
    body:`${locationName} is preparing your pickup order now.${pickup?` Estimated pickup: ${pickup}.`:""}`,
  };
  return {
    subject:`Your ${locationName} order is ready`,
    body:`Your pickup order from ${locationName} is ready. Please head to the pickup area when you arrive.`,
  };
}

export async function notifyOnlineOrderCustomer(input:{
  locationId:string;
  onlineOrderId:string;
  status:CustomerStatus;
}) {
  const shard=await resolveOperationalShardForLocationId(input.locationId,{mode:"read"});
  const [{data:order,error:orderError},{data:settings,error:settingsError},{data:location,error:locationError}]=await Promise.all([
    shard.client.from("pos_online_orders")
      .select("id,customer_name,customer_email,customer_phone,promised_pickup_at")
      .eq("id",input.onlineOrderId).eq("location_id",input.locationId).maybeSingle(),
    shard.client.from("pos_ordering_settings")
      .select("notification_settings")
      .eq("location_id",input.locationId).maybeSingle(),
    supabaseAdmin.from("locations")
      .select("name,restaurant_name,activity_name")
      .eq("id",input.locationId).maybeSingle(),
  ]);
  if(orderError) throw new Error(orderError.message||"online_order_notification_lookup_failed");
  if(settingsError) throw new Error(settingsError.message||"online_order_notification_settings_failed");
  if(locationError) throw new Error(locationError.message||"online_order_notification_location_failed");
  if(!order) return {sent:false,reason:"order_not_found"};

  const cfg=(settings?.notification_settings&&typeof settings.notification_settings==="object")
    ?settings.notification_settings as Record<string,unknown>
    :{};
  const smsEnabled=cfg.sms!==false;
  const emailEnabled=cfg.email!==false;
  const locationName=String(location?.name||location?.restaurant_name||location?.activity_name||"the location");
  const copy=statusCopy(input.status,locationName,order.promised_pickup_at||null);
  const tasks:Promise<unknown>[]=[];
  if(smsEnabled&&order.customer_phone){
    tasks.push(sendSms({to:String(order.customer_phone),body:`TheOutHaven: ${copy.body}`}));
  }
  if(emailEnabled&&order.customer_email){
    tasks.push(sendRawBrandedEmail({
      to:String(order.customer_email),
      subject:copy.subject,
      heading:copy.subject,
      body:copy.body,
      department:"account",
    }));
  }
  const results=await Promise.allSettled(tasks);
  const failed=results.filter(result=>result.status==="rejected").length;
  return {sent:tasks.length>0,attempted:tasks.length,failed};
}

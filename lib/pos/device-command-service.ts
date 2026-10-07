import "server-only";

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

const CLAIM_TTL_MS = 15 * 60_000;
const COMMAND_LEASE_MS = 90_000;
const MAX_COMMAND_ATTEMPTS = 12;

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
function opaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`pos_device_missing_${field}`);
  return normalized;
}
function constantTimeHexEqual(a: string, b: string) {
  try {
    const left=Buffer.from(a,"hex"), right=Buffer.from(b,"hex");
    return left.length===right.length && crypto.timingSafeEqual(left,right);
  } catch { return false; }
}

export async function createPosDeviceClaimCode(input: {
  deviceId: string;
  locationId: string;
  createdBy?: string | null;
}) {
  const deviceId=required(input.deviceId,"device_id");
  const locationId=required(input.locationId,"location_id");
  const code=String(crypto.randomInt(100000,1000000));
  const now=Date.now();
  await supabaseAdmin.from("pos_device_claim_codes").delete().eq("device_id",deviceId).is("used_at",null);
  const { error }=await supabaseAdmin.from("pos_device_claim_codes").insert({
    device_id:deviceId,
    location_id:locationId,
    code_hash:sha256(code),
    expires_at:new Date(now+CLAIM_TTL_MS).toISOString(),
    created_by:input.createdBy||null,
  });
  if(error) throw new Error(error.message||"pos_device_claim_code_create_failed");
  return { code, expiresAt:new Date(now+CLAIM_TTL_MS).toISOString() };
}

export async function claimPosDeviceCredential(input: {
  pairingCode: string;
  installationId: string;
}) {
  const pairingCode=required(input.pairingCode,"pairing_code");
  const installationId=required(input.installationId,"installation_id").slice(0,160);
  const { data: claim, error }=await supabaseAdmin
    .from("pos_device_claim_codes")
    .select("id,device_id,location_id,code_hash,expires_at,used_at")
    .eq("code_hash",sha256(pairingCode))
    .maybeSingle();
  if(error) throw new Error(error.message||"pos_device_claim_lookup_failed");
  if(!claim || claim.used_at || Date.parse(claim.expires_at)<=Date.now()) throw new Error("pos_device_claim_invalid_or_expired");

  const { data: assignment, error: assignmentError }=await supabaseAdmin
    .from("pos_hardware_assignments")
    .select("device_id,location_id,assignment_status")
    .eq("device_id",claim.device_id)
    .eq("location_id",claim.location_id)
    .eq("assignment_status","active")
    .maybeSingle();
  if(assignmentError) throw new Error(assignmentError.message||"pos_device_assignment_lookup_failed");
  if(!assignment) throw new Error("pos_device_claim_not_assigned");

  const credential=opaqueToken();
  const credentialHash=sha256(credential);
  const now=new Date().toISOString();
  const { error: credentialError }=await supabaseAdmin.from("pos_device_credentials").upsert({
    device_id:claim.device_id,
    location_id:claim.location_id,
    installation_id:installationId,
    credential_hash:credentialHash,
    status:"active",
    revoked_at:null,
    rotated_at:now,
    updated_at:now,
  },{onConflict:"device_id"});
  if(credentialError) throw new Error(credentialError.message||"pos_device_credential_create_failed");

  const { error: consumeError }=await supabaseAdmin
    .from("pos_device_claim_codes")
    .update({used_at:now})
    .eq("id",claim.id)
    .is("used_at",null);
  if(consumeError) throw new Error(consumeError.message||"pos_device_claim_consume_failed");

  const { data: location }=await supabaseAdmin.from("locations")
    .select("name,restaurant_name,activity_name")
    .eq("id",claim.location_id).maybeSingle();

  return {
    deviceId:String(claim.device_id),
    locationId:String(claim.location_id),
    locationName:String(location?.name||location?.restaurant_name||location?.activity_name||"").trim()||null,
    credential,
  };
}

export async function authenticatePosDeviceCredential(input: {
  deviceId: string;
  credential: string;
}) {
  const deviceId=required(input.deviceId,"device_id");
  const presentedHash=sha256(required(input.credential,"credential"));
  const { data, error }=await supabaseAdmin.from("pos_device_credentials")
    .select("device_id,location_id,credential_hash,status")
    .eq("device_id",deviceId)
    .eq("status","active")
    .maybeSingle();
  if(error) throw new Error(error.message||"pos_device_auth_lookup_failed");
  if(!data || !constantTimeHexEqual(String(data.credential_hash||""),presentedHash)) throw new Error("pos_device_unauthorized");
  await supabaseAdmin.from("pos_device_credentials").update({last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("device_id",deviceId);
  return { deviceId, locationId:String(data.location_id) };
}

export async function enqueuePosLocationCommand(input: {
  locationId: string;
  commandType: "online_order_received"|"online_order_status_changed"|"device_config_refresh";
  sourceType?: string | null;
  sourceId?: string | null;
  dedupeKey: string;
  payload?: Record<string,unknown>;
}) {
  const row={
    location_id:required(input.locationId,"location_id"),
    command_type:input.commandType,
    source_type:input.sourceType||null,
    source_id:input.sourceId||null,
    dedupe_key:required(input.dedupeKey,"dedupe_key").slice(0,240),
    payload:input.payload||{},
    status:"pending",
    available_at:new Date().toISOString(),
  };
  const { data,error }=await supabaseAdmin.from("pos_location_commands")
    .upsert(row,{onConflict:"location_id,dedupe_key",ignoreDuplicates:true})
    .select("id").maybeSingle();
  if(error) throw new Error(error.message||"pos_command_enqueue_failed");
  return data?.id?String(data.id):null;
}

async function enrichCommand(row: Record<string,any>) {
  if(row.command_type!=="online_order_received" && row.command_type!=="online_order_status_changed") return row;
  const onlineOrderId=String(row.source_id||row.payload?.online_order_id||"").trim();
  if(!onlineOrderId) return row;
  const shard=await resolveOperationalShardForLocationId(String(row.location_id),{mode:"read"});
  const { data: order,error }=await shard.client.from("pos_online_orders")
    .select("id,status,customer_name,customer_email,customer_phone,promised_pickup_at,subtotal_cents,tax_cents,service_charge_cents,tip_cents,total_cents,order_id")
    .eq("id",onlineOrderId).eq("location_id",row.location_id).maybeSingle();
  if(error) throw new Error(error.message||"pos_command_order_lookup_failed");
  if(!order) return row;
  const { data: lines,error:linesError }=await shard.client.from("pos_order_items")
    .select("id,item_name,quantity,unit_price_cents,unit_modifier_total_cents,modifiers,notes")
    .eq("order_id",order.order_id).order("created_at",{ascending:true});
  if(linesError) throw new Error(linesError.message||"pos_command_order_lines_failed");
  const { data: settings }=await shard.client.from("pos_ordering_settings")
    .select("auto_print,notification_settings")
    .eq("location_id",row.location_id).maybeSingle();
  return {
    ...row,
    payload:{
      ...(row.payload||{}),
      online_order_id:order.id,
      order_status:order.status,
      customer:{name:order.customer_name,email:order.customer_email,phone:order.customer_phone},
      promised_pickup_at:order.promised_pickup_at,
      amounts:{
        subtotal_cents:order.subtotal_cents,
        tax_cents:order.tax_cents,
        service_charge_cents:order.service_charge_cents,
        tip_cents:order.tip_cents,
        total_cents:order.total_cents,
      },
      lines:lines||[],
      auto_print:settings?.auto_print!==false,
      notification_settings:settings?.notification_settings||{},
    },
  };
}

export async function leasePosDeviceCommands(input: {
  deviceId: string;
  locationId: string;
  limit?: number;
}) {
  const limit=Math.min(Math.max(Number(input.limit||10),1),25);
  const now=new Date();
  const leaseUntil=new Date(now.getTime()+COMMAND_LEASE_MS).toISOString();
  const { data: candidates,error }=await supabaseAdmin.from("pos_location_commands")
    .select("*")
    .eq("location_id",input.locationId)
    .or(`status.eq.pending,and(status.eq.leased,lease_expires_at.lt.${now.toISOString()})`)
    .lte("available_at",now.toISOString())
    .lt("attempts",MAX_COMMAND_ATTEMPTS)
    .order("created_at",{ascending:true})
    .limit(limit);
  if(error) throw new Error(error.message||"pos_command_list_failed");

  const leased:Record<string,any>[]=[];
  for(const candidate of candidates||[]) {
    const { data: claimed }=await supabaseAdmin.from("pos_location_commands")
      .update({
        status:"leased",
        lease_expires_at:leaseUntil,
        claimed_by_device_id:input.deviceId,
        attempts:Number(candidate.attempts||0)+1,
        updated_at:now.toISOString(),
      })
      .eq("id",candidate.id)
      .eq("location_id",input.locationId)
      .or(`status.eq.pending,and(status.eq.leased,lease_expires_at.lt.${now.toISOString()})`)
      .select("*").maybeSingle();
    if(claimed) leased.push(await enrichCommand(claimed as Record<string,any>));
  }
  return leased;
}

export async function acknowledgePosDeviceCommand(input: {
  deviceId: string;
  locationId: string;
  commandId: string;
  ok: boolean;
  error?: string | null;
}) {
  const commandId=required(input.commandId,"command_id");
  const now=new Date().toISOString();
  const update=input.ok ? {
    status:"acknowledged",
    acknowledged_at:now,
    lease_expires_at:null,
    last_error:null,
    updated_at:now,
  } : {
    status:"pending",
    available_at:new Date(Date.now()+15_000).toISOString(),
    lease_expires_at:null,
    last_error:String(input.error||"device_command_failed").slice(0,500),
    updated_at:now,
  };
  const { data,error }=await supabaseAdmin.from("pos_location_commands")
    .update(update)
    .eq("id",commandId)
    .eq("location_id",input.locationId)
    .eq("claimed_by_device_id",input.deviceId)
    .eq("status","leased")
    .select("id,attempts").maybeSingle();
  if(error) throw new Error(error.message||"pos_command_ack_failed");
  if(!data) throw new Error("pos_command_ack_conflict");
  if(!input.ok && Number(data.attempts||0)>=MAX_COMMAND_ATTEMPTS) {
    await supabaseAdmin.from("pos_location_commands").update({status:"dead_letter",updated_at:now}).eq("id",commandId);
  }
  return { acknowledged:input.ok };
}

export async function getPosDeviceOutputConfig(input: {
  deviceId: string;
  locationId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("pos_hardware_assignments")
    .select("device_id,role,station_key,metadata,updated_at,pos_hardware_devices!inner(id,serial_number,provider,provider_device_id,device_type,lifecycle_status)")
    .eq("location_id", input.locationId)
    .eq("assignment_status", "active")
    .order("role", { ascending: true });
  if (error) throw new Error(error.message || "pos_output_config_failed");

  const routes = (data || []).flatMap((row: any) => {
    const device = row.pos_hardware_devices;
    if (!device || !["receipt_printer","kitchen_printer","cash_drawer"].includes(String(device.device_type))) return [];
    return [{
      role: String(row.role),
      deviceId: String(row.device_id),
      stationKey: String(row.station_key || "default"),
      priority: Number((row as any).metadata?.priority || 0),
      serialNumber: device.serial_number ? String(device.serial_number) : null,
      provider: device.provider ? String(device.provider) : null,
      providerDeviceId: device.provider_device_id ? String(device.provider_device_id) : null,
    }];
  });

  const revision = crypto
    .createHash("sha256")
    .update(JSON.stringify(routes))
    .digest("hex")
    .slice(0, 20);

  return { revision, routes };
}

export async function listPosActiveOnlineOrders(input: {
  locationId: string;
  limit?: number;
}) {
  const shard = await resolveOperationalShardForLocationId(input.locationId, { mode: "read" });
  const limit = Math.min(Math.max(Number(input.limit || 50), 1), 100);
  const { data: orders, error } = await shard.client
    .from("pos_online_orders")
    .select("id,status,customer_name,customer_email,customer_phone,promised_pickup_at,subtotal_cents,tax_cents,service_charge_cents,tip_cents,total_cents,created_at,order_id")
    .eq("location_id", input.locationId)
    .in("status", ["received","accepted","preparing","ready"])
    .order("promised_pickup_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message || "pos_online_orders_list_failed");

  const orderIds = (orders || []).map((order: any) => order.order_id).filter(Boolean);
  let lines: any[] = [];
  if (orderIds.length) {
    const { data, error: linesError } = await shard.client
      .from("pos_order_items")
      .select("order_id,item_name,quantity,modifiers,notes")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });
    if (linesError) throw new Error(linesError.message || "pos_online_order_lines_failed");
    lines = data || [];
  }

  return (orders || []).map((order: any) => ({
    id: String(order.id),
    status: String(order.status),
    customerName: String(order.customer_name || "Guest"),
    customerEmail: order.customer_email || null,
    customerPhone: order.customer_phone || null,
    promisedPickupAt: order.promised_pickup_at || null,
    createdAt: order.created_at,
    amounts: {
      subtotalCents: Number(order.subtotal_cents || 0),
      taxCents: Number(order.tax_cents || 0),
      serviceChargeCents: Number(order.service_charge_cents || 0),
      tipCents: Number(order.tip_cents || 0),
      totalCents: Number(order.total_cents || 0),
    },
    lines: lines
      .filter((line: any) => String(line.order_id) === String(order.order_id))
      .map((line: any) => ({
        name: String(line.item_name || "Item"),
        quantity: Number(line.quantity || 1),
        modifiers: Array.isArray(line.modifiers) ? line.modifiers : [],
        notes: line.notes || null,
      })),
  }));
}

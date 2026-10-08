import "server-only";

import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";
import { enqueuePosLocationCommand } from "@/lib/pos/device-command-service";
import { getPosPaymentProvider } from "@/lib/pos/payments/provider";
import { getStripeModeForLocation } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RpcRow = Record<string, any>;

function required(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`pos_manager_missing_${field}`);
  return text;
}

function positiveInt(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`pos_manager_invalid_${field}`);
  return number;
}

function nonNegativeInt(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`pos_manager_invalid_${field}`);
  return number;
}

const POS_MANAGER_ROLES = new Set(["manager"]);

async function requireManagerApproval(locationId: string, staffProfileId: string) {
  const id = required(staffProfileId, "approver");
  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "read" });
  const { data, error } = await shard.client
    .from("reserve_staff_profiles")
    .select("id,role,is_active")
    .eq("location_id", locationId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "pos_manager_approver_not_found");
  if (data.is_active === false || !POS_MANAGER_ROLES.has(String(data.role || ""))) {
    throw new Error("pos_manager_approval_required");
  }
  return data;
}

async function rpcOne(locationId: string, name: string, args: Record<string, unknown>) {
  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "write" });
  const { data, error } = await shard.client.rpc(name, args);
  if (error) throw new Error(error.message || `${name}_failed`);
  return {
    shard,
    row: (Array.isArray(data) ? data[0] : data) as RpcRow | null,
    data,
  };
}

export async function recordPosCashTender(input: {
  locationId: string;
  checkId: string;
  cashReceivedCents: number;
  amountCents?: number | null;
  tipCents?: number;
  staffProfileId?: string | null;
  deviceId?: string | null;
}) {
  const locationId = required(input.locationId, "location_id");
  const checkId = required(input.checkId, "check_id");
  const cashReceivedCents = positiveInt(input.cashReceivedCents, "cash_received");
  const tipCents = nonNegativeInt(input.tipCents ?? 0, "tip");
  const amountCents =
    input.amountCents == null ? null : positiveInt(input.amountCents, "cash_amount");

  const { row } = await rpcOne(locationId, "pos_record_cash_tender", {
    p_location_id: locationId,
    p_check_id: checkId,
    p_cash_received_cents: cashReceivedCents,
    p_amount_cents: amountCents,
    p_tip_cents: tipCents,
    p_staff_profile_id: input.staffProfileId || null,
    p_device_id: input.deviceId || null,
  });
  if (!row?.tender_id) throw new Error("pos_cash_tender_failed");

  const receiptLines = [
    `Check ${checkId.slice(0,8).toUpperCase()}`,
    `Cash: ${(Number(row.amount_cents||0)/100).toFixed(2)}`,
    Number(row.tip_cents||0) ? `Tip: ${(Number(row.tip_cents)/100).toFixed(2)}` : "",
    `Received: ${(Number(row.cash_received_cents||0)/100).toFixed(2)}`,
    `Change: ${(Number(row.cash_change_cents||0)/100).toFixed(2)}`,
  ].filter(Boolean);

  await Promise.all([
    enqueuePosLocationCommand({
      locationId,
      commandType:"pos_cash_drawer_open",
      sourceType:"pos_tender",
      sourceId:String(row.tender_id),
      dedupeKey:`pos-drawer:tender:${row.tender_id}`,
      payload:{tender_id:row.tender_id,device_id:input.deviceId||null},
    }).catch(()=>null),
    enqueuePosLocationCommand({
      locationId,
      commandType:"pos_receipt_print",
      sourceType:"pos_tender",
      sourceId:String(row.tender_id),
      dedupeKey:`pos-receipt:tender:${row.tender_id}`,
      payload:{header:"THEPOSHAVEN PAYMENT",lines:receiptLines,footer:"Thank you."},
    }).catch(()=>null),
  ]);

  return row;
}

export async function applyPosCheckDiscount(input: {
  locationId: string;
  checkId: string;
  discountCents: number;
  actorStaffProfileId: string;
  approverStaffProfileId: string;
  reason: string;
}) {
  const locationId = required(input.locationId, "location_id");
  await requireManagerApproval(locationId, input.approverStaffProfileId);
  const { data } = await rpcOne(locationId, "pos_apply_check_discount", {
    p_location_id: locationId,
    p_check_id: required(input.checkId, "check_id"),
    p_discount_cents: nonNegativeInt(input.discountCents, "discount"),
    p_actor_staff_profile_id: required(input.actorStaffProfileId, "actor"),
    p_approver_staff_profile_id: required(input.approverStaffProfileId, "approver"),
    p_reason: required(input.reason, "reason"),
  });
  return Number(data || 0);
}

export async function voidPosOrderItem(input: {
  locationId: string;
  orderItemId: string;
  actorStaffProfileId: string;
  approverStaffProfileId: string;
  reason: string;
}) {
  const locationId = required(input.locationId, "location_id");
  await requireManagerApproval(locationId, input.approverStaffProfileId);
  const { data } = await rpcOne(locationId, "pos_void_order_item", {
    p_location_id: locationId,
    p_order_item_id: required(input.orderItemId, "order_item_id"),
    p_actor_staff_profile_id: required(input.actorStaffProfileId, "actor"),
    p_approver_staff_profile_id: required(input.approverStaffProfileId, "approver"),
    p_reason: required(input.reason, "reason"),
  });
  return String(data || "");
}

export async function openPosCashDrawerSession(input: {
  locationId: string;
  deviceId: string;
  staffProfileId?: string | null;
  openingCashCents: number;
}) {
  const locationId = required(input.locationId, "location_id");
  const deviceId=required(input.deviceId, "device_id");
  const { data } = await rpcOne(locationId, "pos_open_cash_drawer_session", {
    p_location_id: locationId,
    p_device_id: deviceId,
    p_staff_profile_id: input.staffProfileId || null,
    p_opening_cash_cents: nonNegativeInt(input.openingCashCents, "opening_cash"),
  });
  const sessionId=String(data||"");
  await enqueuePosLocationCommand({
    locationId,
    commandType:"pos_cash_drawer_open",
    sourceType:"pos_cash_drawer_session",
    sourceId:sessionId,
    dedupeKey:`pos-drawer:session:${sessionId}`,
    payload:{session_id:sessionId,device_id:deviceId},
  }).catch(()=>null);
  return sessionId;
}

export async function closePosCashDrawerSession(input: {
  locationId: string;
  sessionId: string;
  countedCashCents: number;
}) {
  const locationId = required(input.locationId, "location_id");
  const { row } = await rpcOne(locationId, "pos_close_cash_drawer_session", {
    p_location_id: locationId,
    p_session_id: required(input.sessionId, "session_id"),
    p_counted_cash_cents: nonNegativeInt(input.countedCashCents, "counted_cash"),
  });
  if (!row) throw new Error("pos_cash_drawer_close_failed");
  return row;
}

export async function refundPosTender(input: {
  locationId: string;
  tenderId: string;
  amountCents: number;
  actorStaffProfileId: string;
  approverStaffProfileId: string;
  reason: string;
  idempotencyKey: string;
}) {
  const locationId = required(input.locationId, "location_id");
  await requireManagerApproval(locationId, input.approverStaffProfileId);
  const shard = await resolveOperationalShardForLocationId(locationId, { mode: "write" });
  const args = {
    p_location_id: locationId,
    p_tender_id: required(input.tenderId, "tender_id"),
    p_amount_cents: positiveInt(input.amountCents, "refund_amount"),
    p_actor_staff_profile_id: required(input.actorStaffProfileId, "actor"),
    p_approver_staff_profile_id: required(input.approverStaffProfileId, "approver"),
    p_reason: required(input.reason, "reason"),
    p_idempotency_key: required(input.idempotencyKey, "idempotency_key"),
  };
  const { data, error } = await shard.client.rpc("pos_begin_tender_refund", args);
  if (error) throw new Error(error.message || "pos_refund_reservation_failed");
  const reservation = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
  if (!reservation?.refund_request_id) throw new Error("pos_refund_reservation_failed");

  if (String(reservation.request_status) === "completed") {
    return {
      refundRequestId: String(reservation.refund_request_id),
      amountCents: Number(reservation.amount_cents),
      tenderType: String(reservation.tender_type),
      providerRefundId: reservation.provider_refund_id ? String(reservation.provider_refund_id) : null,
    };
  }
  if (String(reservation.request_status) === "failed") {
    throw new Error("pos_refund_request_failed");
  }

  let providerRefundId: string | null = null;
  let providerRefundStatus: string | null = null;
  try {
    if (String(reservation.tender_type) === "card") {
      const connectedAccountId = required(reservation.connected_account_id, "connected_account_id");
      const providerPaymentIntentId = required(
        reservation.provider_payment_intent_id,
        "provider_payment_intent_id",
      );
      const { data: location, error: locationError } = await supabaseAdmin
        .from("locations")
        .select("*")
        .eq("id", locationId)
        .maybeSingle();
      if (locationError || !location) throw new Error(locationError?.message || "pos_location_not_found");

      const provider = getPosPaymentProvider({
        provider: "stripe",
        stripeMode: getStripeModeForLocation(location),
      });
      const refund = await provider.refundPaymentIntent({
        connectedAccountId,
        providerPaymentIntentId,
        amountCents: Number(reservation.amount_cents),
        idempotencyKey: input.idempotencyKey,
        metadata: {
          type: "pos_refund",
          platform: "theouthaven",
          location_id: locationId,
          tender_id: input.tenderId,
          refund_request_id: reservation.refund_request_id,
        },
      });
      providerRefundId = refund.providerRefundId;
      providerRefundStatus = refund.status;
      if (refund.status === "pending") {
        throw new Error("pos_provider_refund_pending");
      }
      if (refund.status !== "succeeded") {
        throw new Error("pos_provider_refund_not_accepted");
      }
    }

    const { data: finalized, error: finalizeError } = await shard.client.rpc(
      "pos_finalize_tender_refund",
      {
        p_location_id: locationId,
        p_refund_request_id: reservation.refund_request_id,
        p_provider_refund_id: providerRefundId,
      },
    );
    if (finalizeError) throw new Error(finalizeError.message || "pos_refund_finalize_failed");
    const amountCents = Number(finalized || reservation.amount_cents);
    await Promise.all([
      String(reservation.tender_type)==="cash"
        ? enqueuePosLocationCommand({
            locationId,
            commandType:"pos_cash_drawer_open",
            sourceType:"pos_refund",
            sourceId:String(reservation.refund_request_id),
            dedupeKey:`pos-drawer:refund:${reservation.refund_request_id}`,
            payload:{refund_request_id:reservation.refund_request_id},
          }).catch(()=>null)
        : Promise.resolve(null),
      enqueuePosLocationCommand({
        locationId,
        commandType:"pos_receipt_print",
        sourceType:"pos_refund",
        sourceId:String(reservation.refund_request_id),
        dedupeKey:`pos-receipt:refund:${reservation.refund_request_id}`,
        payload:{
          header:"THEPOSHAVEN REFUND",
          lines:[
            `Refund: ${(amountCents/100).toFixed(2)}`,
            `Tender: ${String(reservation.tender_type).toUpperCase()}`,
            `Reason: ${String(input.reason).trim()}`,
          ],
          footer:"Refund processed.",
        },
      }).catch(()=>null),
    ]);
    return {
      refundRequestId: String(reservation.refund_request_id),
      amountCents,
      tenderType: String(reservation.tender_type),
      providerRefundId,
    };
  } catch (error) {
    const providerMayHaveAccepted =
      String(reservation.tender_type) === "card" &&
      Boolean(providerRefundId) &&
      (providerRefundStatus === "pending" || providerRefundStatus === "succeeded");
    if (!providerMayHaveAccepted) {
      await shard.client.rpc("pos_fail_tender_refund", {
        p_location_id: locationId,
        p_refund_request_id: reservation.refund_request_id,
        p_error_message: error instanceof Error ? error.message : "pos_refund_failed",
      });
    }
    throw error;
  }
}

export async function getPosManagerOperations(locationId: string) {
  const id = required(locationId, "location_id");
  const shard = await resolveOperationalShardForLocationId(id, { mode: "read" });
  const [{ data: drawers, error: drawerError }, { data: events, error: eventError }] =
    await Promise.all([
      shard.client
        .from("pos_cash_drawer_sessions")
        .select("*")
        .eq("location_id", id)
        .order("opened_at", { ascending: false })
        .limit(20),
      shard.client
        .from("pos_manager_events")
        .select("*")
        .eq("location_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  if (drawerError) throw new Error(drawerError.message || "pos_drawer_sessions_failed");
  if (eventError) throw new Error(eventError.message || "pos_manager_events_failed");
  return { drawers: drawers || [], events: events || [] };
}


export async function queuePosCheckReceipt(input:{
  locationId:string;
  checkId:string;
  reprint?:boolean;
}){
  const locationId=required(input.locationId,"location_id");
  const checkId=required(input.checkId,"check_id");
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const [
    {data:check,error:checkError},
    {data:items,error:itemError},
    {data:tenders,error:tenderError},
    {data:resources,error:resourceError},
  ]=await Promise.all([
    shard.client.from("pos_checks")
      .select("id,subtotal_cents,discount_cents,tax_cents,service_charge_cents,total_cents,amount_paid_cents,amount_refunded_cents,tip_cents,status")
      .eq("location_id",locationId).eq("id",checkId).maybeSingle(),
    shard.client.from("pos_order_items")
      .select("item_name,quantity,line_total_cents,status")
      .eq("location_id",locationId).eq("check_id",checkId).order("created_at",{ascending:true}),
    shard.client.from("pos_tenders")
      .select("tender_number,tender_type,status,amount_cents,tip_cents,amount_refunded_cents")
      .eq("location_id",locationId).eq("check_id",checkId).order("tender_number",{ascending:true}),
    shard.client.from("pos_check_resources")
      .select("resource_label").eq("location_id",locationId).eq("check_id",checkId),
  ]);
  if(checkError||!check) throw new Error(checkError?.message||"pos_check_not_found");
  if(itemError) throw new Error(itemError.message||"pos_receipt_items_failed");
  if(tenderError) throw new Error(tenderError.message||"pos_receipt_tenders_failed");
  if(resourceError) throw new Error(resourceError.message||"pos_receipt_resources_failed");

  const money=(value:unknown)=>`$${(Number(value||0)/100).toFixed(2)}`;
  const lines:string[]=[];
  const labels=(resources||[]).map((row:any)=>String(row.resource_label||"")).filter(Boolean);
  if(labels.length) lines.push(labels.join(" + "));
  for(const item of items||[]){
    if(String(item.status)==="voided") continue;
    lines.push(`${Number(item.quantity||1)} x ${String(item.item_name||"Item")}  ${money(item.line_total_cents)}`);
  }
  lines.push("------------------------------------------");
  lines.push(`Subtotal  ${money(check.subtotal_cents)}`);
  if(Number(check.discount_cents||0)) lines.push(`Discount  -${money(check.discount_cents)}`);
  if(Number(check.tax_cents||0)) lines.push(`Tax  ${money(check.tax_cents)}`);
  if(Number(check.service_charge_cents||0)) lines.push(`Service  ${money(check.service_charge_cents)}`);
  lines.push(`TOTAL  ${money(check.total_cents)}`);
  for(const tender of tenders||[]){
    if(!["completed","partially_refunded","refunded"].includes(String(tender.status))) continue;
    const net=Math.max(0,Number(tender.amount_cents||0)-Number(tender.amount_refunded_cents||0));
    lines.push(`#${Number(tender.tender_number||0)} ${String(tender.tender_type||"other").toUpperCase()}  ${money(net)}`);
  }
  if(Number(check.amount_refunded_cents||0)) lines.push(`Refunded  ${money(check.amount_refunded_cents)}`);
  lines.push(`Paid  ${money(check.amount_paid_cents)}`);

  const key=input.reprint
    ? `pos-receipt:reprint:${checkId}:${Date.now()}`
    : `pos-receipt:check:${checkId}`;
  await enqueuePosLocationCommand({
    locationId,
    commandType:"pos_receipt_print",
    sourceType:"pos_check",
    sourceId:checkId,
    dedupeKey:key,
    payload:{
      header:input.reprint?"THEPOSHAVEN RECEIPT · REPRINT":"THEPOSHAVEN RECEIPT",
      lines,
      footer:"Thank you.",
    },
  });
  return {checkId,queued:true};
}

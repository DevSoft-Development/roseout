import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { resolveMobileIdentity } from "../../_lib/identity";
import { mobileError, mobileJson } from "../../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser(request: NextRequest) {
  const identity = await resolveMobileIdentity(request);
  if (!identity || identity.kind !== "user") return null;
  return identity.userId;
}

function shape(row: any) {
  return {
    id: String(row.id),
    status: String(row.status || "saved"),
    title: row.title || "TheOutHaven OUTing",
    outingDate: row.outing_date || null,
    restaurant: row.restaurant_id || row.restaurant_name ? {
      id: row.restaurant_id || null,
      name: row.restaurant_name || "Restaurant",
      address: row.restaurant_address || null,
      publicUrl: row.restaurant_url || null,
    } : null,
    activity: row.activity_id || row.activity_name ? {
      id: row.activity_id || null,
      name: row.activity_name || "Activity",
      address: row.activity_address || null,
      publicUrl: row.activity_url || null,
    } : null,
    reservation: row.reservation_payload || {},
    plan: row.plan_payload || {},
    bookedAt: row.booked_at || null,
    completedAt: row.completed_at || null,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser(request);
  if (!userId) return mobileError("AUTH_REQUIRED", "Sign in to view this OUTing.", 401);
  const { id } = await context.params;
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("user_outings").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) return mobileError("OUTING_LOAD_FAILED", "This OUTing could not be loaded.", 500);
  if (!data) return mobileError("OUTING_NOT_FOUND", "This OUTing was not found.", 404);
  return mobileJson({ ok: true, outing: shape(data) });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser(request);
  if (!userId) return mobileError("AUTH_REQUIRED", "Sign in to update this OUTing.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (action === "start") {
    update.status = "active";
    update.booked_at = body?.bookedAt || now;
  } else if (action === "complete") {
    update.status = "completed";
    update.completed_at = now;
  } else if (action === "upcoming") {
    update.status = "booked";
  } else {
    return mobileError("INVALID_ACTION", "That OUTing action is not supported.", 400);
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("user_outings").update(update).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error) return mobileError("OUTING_UPDATE_FAILED", "This OUTing could not be updated.", 500);
  if (!data) return mobileError("OUTING_NOT_FOUND", "This OUTing was not found.", 404);
  return mobileJson({ ok: true, outing: shape(data) });
}

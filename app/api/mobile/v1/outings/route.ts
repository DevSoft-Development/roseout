import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { resolveMobileIdentity } from "../_lib/identity";
import { mobileError, mobileJson } from "../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requireUser(request: NextRequest) {
  const identity = await resolveMobileIdentity(request);
  if (!identity) return { error: mobileError("INVALID_IDENTITY", "Your session could not be verified.", 401), userId: null };
  if (identity.kind !== "user") return { error: mobileError("AUTH_REQUIRED", "Sign in to save and sync your OUTings.", 401), userId: null };
  return { error: null, userId: identity.userId };
}

function shapeOuting(row: any) {
  return {
    id: String(row.id),
    status: String(row.status || "saved"),
    title: row.title || "TheOutHaven OUTing",
    prompt: row.prompt || null,
    outingDate: row.outing_date || null,
    partySize: row.party_size ?? null,
    restaurant: row.restaurant_id || row.restaurant_name ? {
      id: row.restaurant_id || null,
      name: row.restaurant_name || "Restaurant",
      address: row.restaurant_address || null,
      imageUrl: row.restaurant_image || null,
      publicUrl: row.restaurant_url || null,
    } : null,
    activity: row.activity_id || row.activity_name ? {
      id: row.activity_id || null,
      name: row.activity_name || "Activity",
      address: row.activity_address || null,
      imageUrl: row.activity_image || null,
      publicUrl: row.activity_url || null,
    } : null,
    bookedAt: row.booked_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error || !auth.userId) return auth.error!;

  const admin = getSupabaseAdminClient();
  const [{ data: outings, error: outingsError }, { data: plans, error: plansError }] = await Promise.all([
    admin.from("user_outings")
      .select("id,status,title,prompt,outing_date,party_size,restaurant_id,restaurant_name,restaurant_address,restaurant_image,restaurant_url,activity_id,activity_name,activity_address,activity_image,activity_url,booked_at,completed_at,created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("saved_plans")
      .select("id,title,summary,plan_data,created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (outingsError || plansError) return mobileError("OUTINGS_LOAD_FAILED", "Your OUTings could not be loaded.", 500);

  const now = Date.now();
  const shaped = (outings || []).map(shapeOuting);
  const upcoming = shaped.filter((item) => item.status !== "completed" && !item.completedAt && (!item.outingDate || Date.parse(item.outingDate) >= now));
  const completed = shaped.filter((item) => item.status === "completed" || Boolean(item.completedAt) || (item.outingDate && Date.parse(item.outingDate) < now));
  const saved = (plans || []).filter((item: any) => item?.plan_data?.mobileKind !== "favorite_location").map((item: any) => ({
    id: String(item.id),
    title: item.title || "Saved OUTing",
    summary: item.summary || null,
    planData: item.plan_data || {},
    createdAt: item.created_at || null,
  }));
  const favorites = (plans || []).filter((item: any) => item?.plan_data?.mobileKind === "favorite_location").map((item: any) => ({
    id: String(item.id),
    locationId: item.plan_data?.locationId || null,
    name: item.title || "Favorite",
    kind: item.plan_data?.kind || null,
    category: item.plan_data?.category || null,
    publicUrl: item.plan_data?.publicUrl || null,
    createdAt: item.created_at || null,
  }));

  return mobileJson({ ok: true, upcoming, saved, completed, favorites });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error || !auth.userId) return auth.error!;

  const body = await request.json().catch(() => ({}));
  const restaurant = body?.restaurant || null;
  const activity = body?.activity || null;
  const dedupeKey = asText(body?.dedupeKey) || [auth.userId, restaurant?.id || restaurant?.name || "", activity?.id || activity?.name || "", asText(body?.outingDate) || ""].join(":");
  const now = new Date().toISOString();

  const row = {
    user_id: auth.userId,
    dedupe_key: dedupeKey,
    source: "mobile",
    status: asText(body?.status) || "saved",
    title: asText(body?.title) || "TheOutHaven OUTing",
    prompt: asText(body?.prompt),
    outing_date: asText(body?.outingDate),
    party_size: Number.isFinite(Number(body?.partySize)) ? Number(body.partySize) : null,
    restaurant_id: asText(restaurant?.id),
    restaurant_name: asText(restaurant?.name),
    restaurant_address: asText(restaurant?.address),
    restaurant_image: asText(restaurant?.imageUrl),
    restaurant_url: asText(restaurant?.publicUrl),
    activity_id: asText(activity?.id),
    activity_name: asText(activity?.name),
    activity_address: asText(activity?.address),
    activity_image: asText(activity?.imageUrl),
    activity_url: asText(activity?.publicUrl),
    plan_payload: body?.planPayload || body || {},
    reservation_payload: {},
    updated_at: now,
  };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("user_outings")
    .upsert(row, { onConflict: "user_id,dedupe_key" })
    .select("id,status")
    .single();

  if (error) return mobileError("OUTING_SAVE_FAILED", "This OUTing could not be saved yet.", 500);
  return mobileJson({ ok: true, outingId: data.id, status: data.status });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error || !auth.userId) return auth.error!;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return mobileError("OUTING_ID_REQUIRED", "An OUTing id is required.", 400);

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("user_outings").delete().eq("id", id).eq("user_id", auth.userId);
  if (error) return mobileError("OUTING_DELETE_FAILED", "This OUTing could not be removed.", 500);
  return mobileJson({ ok: true });
}

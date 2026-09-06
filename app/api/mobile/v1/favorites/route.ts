import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { resolveMobileIdentity } from "../_lib/identity";
import { mobileError, mobileJson } from "../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser(request: NextRequest) {
  const identity = await resolveMobileIdentity(request);
  if (!identity) return { error: mobileError("INVALID_IDENTITY", "Your session could not be verified.", 401), userId: null };
  if (identity.kind !== "user") return { error: mobileError("AUTH_REQUIRED", "Sign in to sync favorites.", 401), userId: null };
  return { error: null, userId: identity.userId };
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error || !auth.userId) return auth.error!;
  const body = await request.json().catch(() => ({}));
  const locationId = typeof body?.locationId === "string" ? body.locationId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!locationId || !name) return mobileError("FAVORITE_REQUIRED", "A location is required.", 400);

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.from("saved_plans")
    .select("id,plan_data")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const match = (existing || []).find((item: any) => item?.plan_data?.mobileKind === "favorite_location" && item?.plan_data?.locationId === locationId);
  if (match) return mobileJson({ ok: true, favoriteId: match.id, alreadyExists: true });

  const { data, error } = await admin.from("saved_plans").insert({
    user_id: auth.userId,
    title: name,
    summary: typeof body?.category === "string" ? body.category : null,
    plan_data: {
      mobileKind: "favorite_location",
      locationId,
      kind: body?.kind || null,
      category: body?.category || null,
      publicUrl: body?.publicUrl || null,
    },
  }).select("id").single();

  if (error) return mobileError("FAVORITE_SAVE_FAILED", "This favorite could not be saved yet.", 500);
  return mobileJson({ ok: true, favoriteId: data.id, alreadyExists: false });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error || !auth.userId) return auth.error!;
  const favoriteId = request.nextUrl.searchParams.get("id");
  if (!favoriteId) return mobileError("FAVORITE_ID_REQUIRED", "A favorite id is required.", 400);

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("saved_plans").delete().eq("id", favoriteId).eq("user_id", auth.userId);
  if (error) return mobileError("FAVORITE_DELETE_FAILED", "This favorite could not be removed.", 500);
  return mobileJson({ ok: true });
}

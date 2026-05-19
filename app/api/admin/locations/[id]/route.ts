import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const selectCols = "id,name,restaurant_name,activity_name,address,city,state,phone,website,reservation_link,primary_category,cuisine,activity_type,rating,description,tags,vibes,best_for,is_claimed,claim_code,claim_url,claim_qr_url,owner_user_id,quality_score,recommendation_score,semantic_search_text,semantic_tags,intent_tags,latitude,longitude";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;
  const { id } = await params;
  const [r, a] = await Promise.all([
    supabaseAdmin.from("restaurants").select(selectCols).eq("id", id).maybeSingle(),
    supabaseAdmin.from("activities").select(selectCols).eq("id", id).maybeSingle(),
  ]);
  const location = r.data ? { ...r.data, source_table: "restaurants" } : a.data ? { ...a.data, source_table: "activities" } : null;
  if (!location) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ location });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json();
  const safe = {
    reservation_link: body.reservation_link ?? null,
    phone: body.phone ?? null,
    website: body.website ?? null,
    semantic_search_text: body.semantic_search_text ?? null,
  };
  await supabaseAdmin.from("restaurants").update(safe).eq("id", id);
  await supabaseAdmin.from("activities").update(safe).eq("id", id);
  return Response.json({ ok: true });
}

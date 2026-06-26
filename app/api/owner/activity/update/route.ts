import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation, sanitizeOwnerLocationResponse } from "@/lib/auth/locationOwnerAccess";

const OWNER_EDITABLE_FIELDS = new Set([
  "name",
  "location_name",
  "restaurant_name",
  "description",
  "phone",
  "website",
  "instagram",
  "hours",
  "operating_hours",
  "cuisine_type",
  "category",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Request could not be completed." }, { status: 400 }); }

  const activityId = String(body.activity_id || body.location_id || "").trim();
  if (!activityId) return NextResponse.json({ error: "Location not found." }, { status: 400 });

  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, activityId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates = Object.fromEntries(
    Object.entries(body).filter(([key]) => OWNER_EDITABLE_FIELDS.has(key)),
  );
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Request could not be completed." }, { status: 400 });
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("locations")
    .update(updates)
    .eq("id", String(authorized.location.id))
    .select("id,source_id,source_location_id,source_table,name,location_name,restaurant_name,description,phone,website,instagram,hours,operating_hours,cuisine_type,category,updated_at")
    .single();

  if (error) {
    console.error("OWNER_RESTAURANT_UPDATE_FAILED", error);
    return NextResponse.json({ error: "Request could not be completed." }, { status: 500 });
  }

  return NextResponse.json({ activity: sanitizeOwnerLocationResponse(data) });
}

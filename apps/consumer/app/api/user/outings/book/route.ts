import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function clean(value: unknown, max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "AUTH_REQUIRED", message: "Log in to add this outing to your profile." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const savedPlanId = clean(body.saved_plan_id || body.planId, 80);
  if (!savedPlanId) return NextResponse.json({ success: false, error: "MISSING_SAVED_PLAN" }, { status: 400 });

  // Legacy saved plans remain readable, but new lifecycle writes always land in public.outings.
  const { data: savedPlan } = await supabaseAdmin
    .from("saved_plans")
    .select("id,user_id,title,summary,prompt,plan_data,created_at")
    .eq("id", savedPlanId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!savedPlan) return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });

  const { data: existing } = await supabaseAdmin
    .from("outings")
    .select("id,status")
    .eq("user_id", user.id)
    .contains("metadata", { legacy_saved_plan_id: savedPlanId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (existing.status === "saved") {
      await supabaseAdmin.from("outings").update({ status: "planned", updated_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", user.id);
    }
    return NextResponse.json({ success: true, outingId: existing.id, alreadyExists: true, redirectTo: `/user/dashboard/outings/${existing.id}` });
  }

  const planData = asObject(savedPlan.plan_data);
  const restaurant = asObject(planData.restaurant);
  const activity = asObject(planData.activity);
  const restaurantId = isUuid(restaurant.id) ? restaurant.id : null;
  const activityId = isUuid(activity.id) ? activity.id : null;
  const primaryId = restaurantId || activityId;
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("outings")
    .insert({
      user_id: user.id,
      location_id: primaryId,
      source_location_id: primaryId,
      restaurant_location_id: restaurantId,
      activity_location_id: activityId,
      status: "planned",
      reservation_type: "external",
      contact_method: "book_plan",
      source: "saved_plan_detail",
      source_query: clean(savedPlan.prompt || savedPlan.summary),
      plan_title: clean(savedPlan.title) || "TheOutHaven Outing",
      saved_at: savedPlan.created_at || now,
      created_by_type: "user",
      email_opt_in: false,
      sms_opt_in: false,
      metadata: {
        schema_version: "canonical_user_outing_v1",
        legacy_saved_plan_id: savedPlanId,
        selected_locations: { restaurant, activity },
      },
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json({ success: false, error: "OUTING_CREATE_FAILED", message: "We could not add this outing to your profile yet." }, { status: 500 });
  }

  return NextResponse.json({ success: true, outingId: data.id, alreadyExists: false, redirectTo: `/user/dashboard/outings/${data.id}` });
}

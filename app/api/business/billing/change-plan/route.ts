import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please log in to change subscription." }, { status: 401 });
  }

  const body = await request.formData();
  const locationId = String(body.get("location_id") || "").trim();
  const nextPlan = String(body.get("plan") || "free").toLowerCase() === "pro" ? "pro" : "free";

  if (!locationId) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }

  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  await supabaseAdmin
    .from("locations")
    .update({
      subscription_plan: nextPlan,
      subscription_status: nextPlan === "pro" ? "active" : "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", locationId);

  return NextResponse.redirect(new URL(`/business/dashboard/billing?location=${locationId}&plan_changed=1`, request.url), 303);
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please log in to change subscription." }, { status: 401 });
  }

  const body = await request.formData();
  const locationId = String(body.get("location_id") || "").trim();
  const requestedPlan = String(body.get("plan") || "free").toLowerCase();
  const nextPlan: "pro" | "free" = requestedPlan === "pro" ? "pro" : "free";

  if (!locationId) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }

  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (nextPlan === "pro") {
    return NextResponse.json({ error: "Pro upgrades must be completed through checkout." }, { status: 403 });
  }

  await supabaseAdmin
    .from("locations")
    .update({
      subscription_plan: nextPlan,
      subscription_status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(authorized.location.id));

  return NextResponse.redirect(new URL(`/business/dashboard/billing?location=${String(authorized.location.id)}&plan_changed=1`, request.url), 303);
}

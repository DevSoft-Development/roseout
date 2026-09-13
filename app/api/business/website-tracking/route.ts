import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { buildTrackerSnippet, normalizeOrigin } from "@/lib/analytics/conversion-attribution";

function isPaidPlan(location: any) {
  const values = [location?.plan, location?.business_plan, location?.subscription_plan, location?.pricing_plan, location?.tier, location?.subscription_tier]
    .filter(Boolean).map((value) => String(value).toLowerCase());
  const status = String(location?.subscription_status || location?.plan_status || "").toLowerCase();
  return status !== "cancelled" && values.some((value) => value === "essentials" || value === "pro" || value === "premium" || value === "business_pro" || value.includes("essential") || value.includes("pro"));
}

async function authorize(locationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  const { data: location } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  if (!location) return { error: NextResponse.json({ success: false, error: "Location not found" }, { status: 404 }) };
  if (!access.access.isAdmin && !isPaidPlan(location)) return { error: NextResponse.json({ success: false, error: "Website Conversion Tracking is included with Essentials." }, { status: 402 }) };
  return { location };
}

export async function GET(request: NextRequest) {
  const locationId = new URL(request.url).searchParams.get("location_id") || "";
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });
  const auth = await authorize(locationId); if (auth.error) return auth.error;
  let { data: config } = await supabaseAdmin.from("location_website_tracking").select("*").eq("location_id", locationId).maybeSingle();
  if (!config) {
    const { data, error } = await supabaseAdmin.from("location_website_tracking").insert({ location_id: locationId }).select("*").single();
    if (error) return NextResponse.json({ success: false, error: "Could not initialize tracking" }, { status: 500 });
    config = data;
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com";
  return NextResponse.json({ success: true, config, snippet: buildTrackerSnippet(config.site_key, origin.replace(/\/$/, "")) });
}

export async function POST(request: NextRequest) {
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }
  const locationId = typeof body?.location_id === "string" ? body.location_id : "";
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });
  const auth = await authorize(locationId); if (auth.error) return auth.error;
  const origins = Array.isArray(body?.allowed_origins) ? body.allowed_origins.map((value: unknown) => normalizeOrigin(String(value))).filter(Boolean).slice(0, 10) : [];
  const average = body?.average_customer_value == null || body.average_customer_value === "" ? null : Number(body.average_customer_value);
  if (average != null && (!Number.isFinite(average) || average < 0 || average > 100000)) return NextResponse.json({ success: false, error: "Invalid average customer value" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("location_website_tracking").upsert({
    location_id: locationId,
    allowed_origins: origins,
    enabled: body?.enabled !== false,
    average_customer_value: average,
    updated_at: new Date().toISOString(),
  }, { onConflict: "location_id" }).select("*").single();
  if (error) return NextResponse.json({ success: false, error: "Could not save tracking settings" }, { status: 500 });
  return NextResponse.json({ success: true, config: data });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  cleanSearchTerm,
  rankOnboardingLocation,
  toOnboardingLocation,
} from "@/lib/locations/onboarding";

export const dynamic = "force-dynamic";

const LOCATION_SELECT =
  "id,name,restaurant_name,activity_name,location_type,primary_category,address,city,state,zip_code,phone,website,is_claimed,claimed,claim_status,owner_user_id";

export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientKey = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const rateLimit = await enforceRateLimit(`business-location-search:${clientKey}`, 60, 60_000);

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many searches. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds || 60) },
      },
    );
  }

  const locationId = request.nextUrl.searchParams.get("id")?.trim() || "";
  if (locationId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(locationId)) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select(LOCATION_SELECT)
      .eq("id", locationId)
      .is("deleted_at", null)
      .eq("active", true)
      .eq("is_hidden", false)
      .maybeSingle();
    if (error) {
      console.error("Business location lookup failed", error);
      return NextResponse.json({ error: "Location search is unavailable." }, { status: 500 });
    }
    return NextResponse.json({
      locations: data
        ? [toOnboardingLocation(data as Record<string, unknown>)]
        : [],
    });
  }

  const query = cleanSearchTerm(request.nextUrl.searchParams.get("q"));
  if (query.length < 3) return NextResponse.json({ locations: [] });

  const search = `%${query}%`;
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_SELECT)
    .is("deleted_at", null)
    .eq("active", true)
    .eq("is_hidden", false)
    .or(
      [
        `name.ilike.${search}`,
        `restaurant_name.ilike.${search}`,
        `activity_name.ilike.${search}`,
        `address.ilike.${search}`,
        `city.ilike.${search}`,
        `zip_code.eq.${query}`,
      ].join(","),
    )
    .limit(30);

  if (error) {
    console.error("Business location search failed", error);
    return NextResponse.json({ error: "Location search is unavailable." }, { status: 500 });
  }

  const locations = (data || [])
    .map((row) => toOnboardingLocation(row as Record<string, unknown>))
    .sort(
      (left, right) =>
        rankOnboardingLocation(right, query) - rankOnboardingLocation(left, query) ||
        left.name.localeCompare(right.name),
    )
    .slice(0, 6);

  return NextResponse.json(
    { locations },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

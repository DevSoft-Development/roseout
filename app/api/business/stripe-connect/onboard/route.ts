import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl } from "@/lib/stripe/server";

async function handleOnboarding(request: NextRequest, locationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const url = new URL("/locations/dashboard/billing/stripe", getSiteUrl());
  url.searchParams.set("location_id", locationId);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const locationId = String(form.get("location_id") || "").trim();
    return await handleOnboarding(request, locationId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Stripe onboarding." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const locationId = String(request.nextUrl.searchParams.get("location_id") || "").trim();
    return await handleOnboarding(request, locationId);
  } catch {
    return NextResponse.redirect(`${getSiteUrl()}/locations/dashboard/billing?connect=error`);
  }
}

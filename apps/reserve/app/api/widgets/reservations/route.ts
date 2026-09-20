import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hostname(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  }
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

async function locationContext(locationId: string) {
  const [{ data: website }, { data: location }] = await Promise.all([
    supabaseAdmin
      .from("business_websites")
      .select("domain, platform_domain")
      .eq("location_id", locationId)
      .maybeSingle(),
    supabaseAdmin
      .from("locations")
      .select("id, location_type")
      .eq("id", locationId)
      .maybeSingle(),
  ]);
  if (!website || !location) return null;
  const rawType = clean(location.location_type).toLowerCase();
  const locationType = rawType.includes("activ") ? "activity" : "restaurant";
  return { website, locationType };
}

function originAllowed(origin: string | null, website: { domain?: string | null; platform_domain?: string | null }) {
  if (!origin) return false;
  let originHost = "";
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  const allowed = new Set([
    hostname(website.domain),
    hostname(website.platform_domain),
    "theouthaven.com",
    "www.theouthaven.com",
  ].filter(Boolean));
  return allowed.has(originHost);
}

async function authorize(request: NextRequest, locationId: string) {
  const context = await locationContext(locationId);
  if (!context) return { error: NextResponse.json({ error: "Reservation website not found." }, { status: 404 }), context: null, origin: "" };
  const origin = request.headers.get("origin");
  if (!originAllowed(origin, context.website)) {
    return { error: NextResponse.json({ error: "This website is not authorized for this reservation widget." }, { status: 403 }), context: null, origin: "" };
  }
  return { error: null, context, origin: origin! };
}

async function proxyJson(request: NextRequest, path: string, init?: RequestInit) {
  const target = new URL(path, request.nextUrl.origin);
  const response = await fetch(target, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

export async function OPTIONS(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  if (!locationId) return new NextResponse(null, { status: 400 });
  const auth = await authorize(request, locationId);
  if (auth.error) return auth.error;
  return new NextResponse(null, { status: 204, headers: corsHeaders(auth.origin) });
}

export async function GET(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  const action = clean(request.nextUrl.searchParams.get("action"));
  const date = clean(request.nextUrl.searchParams.get("date"));
  const partySize = Math.min(Math.max(Number(request.nextUrl.searchParams.get("partySize") || 2), 1), 12);
  if (!locationId || !["availability", "seating"].includes(action) || !date) {
    return NextResponse.json({ error: "Invalid reservation widget request." }, { status: 400 });
  }
  const auth = await authorize(request, locationId);
  if (auth.error || !auth.context) return auth.error!;

  if (action === "seating") {
    const time = clean(request.nextUrl.searchParams.get("time"));
    const times = clean(request.nextUrl.searchParams.get("times"));
    const preference = clean(request.nextUrl.searchParams.get("preference")) || "any";
    if (!time && !times) {
      return NextResponse.json({ error: "Reservation times are required." }, { status: 400, headers: corsHeaders(auth.origin) });
    }
    const params = new URLSearchParams({
      locationId,
      type: auth.context.locationType,
      date,
      partySize: String(partySize),
      preference,
    });
    if (time) params.set("time", time);
    if (times) params.set("times", times);
    const result = await proxyJson(request, `/api/reserve/location/seating-options?${params.toString()}`);
    return NextResponse.json(result.payload, { status: result.status, headers: corsHeaders(auth.origin) });
  }

  const params = new URLSearchParams({
    locationId,
    locationType: auth.context.locationType,
    date,
    partySize: String(partySize),
  });
  const result = await proxyJson(request, `/api/reserve/availability?${params.toString()}`);
  return NextResponse.json(result.payload, { status: result.status, headers: corsHeaders(auth.origin) });
}

export async function POST(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  const action = clean(request.nextUrl.searchParams.get("action"));
  if (!locationId || !["lock", "book", "waitlist"].includes(action)) {
    return NextResponse.json({ error: "Invalid reservation widget request." }, { status: 400 });
  }
  const auth = await authorize(request, locationId);
  if (auth.error || !auth.context) return auth.error!;

  const body = await request.json().catch(() => ({}));
  const payload = {
    ...body,
    location_id: locationId,
    location_type: auth.context.locationType,
  };
  const path = action === "lock"
    ? "/api/reservations/lock-slot"
    : action === "book"
      ? "/api/reserve/location/auto"
      : "/api/reserve/portal/waitlist";
  const result = await proxyJson(request, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return NextResponse.json(result.payload, { status: result.status, headers: corsHeaders(auth.origin) });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createWebsitePickupOrder,
  finalizeWebsitePickupOrder,
  getWebsiteOrderingCatalog,
} from "@/lib/pos/online-ordering/service";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

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
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

async function websiteContext(locationId: string) {
  const [{ data: website }, { data: location }] = await Promise.all([
    supabaseAdmin
      .from("business_websites")
      .select("domain,platform_domain,status,deployment_status,last_publish_status")
      .eq("location_id", locationId)
      .maybeSingle(),
    supabaseAdmin
      .from("locations")
      .select("id,name,restaurant_name,activity_name")
      .eq("id", locationId)
      .maybeSingle(),
  ]);
  if (!website || !location) return null;
  return { website, location };
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
  const context = await websiteContext(locationId);
  if (!context) {
    return { error: NextResponse.json({ error: "Ordering website not found." }, { status: 404 }), context: null, origin: "" };
  }
  const origin = request.headers.get("origin");
  if (!originAllowed(origin, context.website)) {
    return { error: NextResponse.json({ error: "This website is not authorized for online ordering." }, { status: 403 }), context: null, origin: "" };
  }
  return { error: null, context, origin: origin! };
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
  const action = clean(request.nextUrl.searchParams.get("action")) || "catalog";
  if (!locationId || !["catalog", "status"].includes(action)) {
    return NextResponse.json({ error: "Invalid online-order request." }, { status: 400 });
  }
  const auth = await authorize(request, locationId);
  if (auth.error || !auth.context) return auth.error!;

  try {
    if (action === "catalog") {
      const catalog = await getWebsiteOrderingCatalog(locationId);
      return NextResponse.json({
        ok: true,
        location: {
          id: locationId,
          name: clean(auth.context.location.name)
            || clean(auth.context.location.restaurant_name)
            || clean(auth.context.location.activity_name)
            || "Order Online",
        },
        ...catalog,
      }, { headers: corsHeaders(auth.origin) });
    }

    const onlineOrderId = clean(request.nextUrl.searchParams.get("onlineOrderId"));
    if (!onlineOrderId) {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400, headers: corsHeaders(auth.origin) });
    }
    const shard = await resolveOperationalShardForLocationId(locationId, { mode: "read" });
    const { data, error } = await shard.client
      .from("pos_online_orders")
      .select("id,status,promised_pickup_at,created_at,updated_at")
      .eq("id", onlineOrderId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404, headers: corsHeaders(auth.origin) });
    return NextResponse.json({ ok: true, order: data }, { headers: corsHeaders(auth.origin) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Online ordering unavailable." },
      { status: 409, headers: corsHeaders(auth.origin) },
    );
  }
}

export async function POST(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  const action = clean(request.nextUrl.searchParams.get("action"));
  if (!locationId || !["create", "finalize"].includes(action)) {
    return NextResponse.json({ error: "Invalid online-order request." }, { status: 400 });
  }
  const auth = await authorize(request, locationId);
  if (auth.error || !auth.context) return auth.error!;

  const body = await request.json().catch(() => ({}));
  try {
    if (action === "create") {
      const headerKey = clean(request.headers.get("idempotency-key"));
      const idempotencyKey = headerKey || clean(body.idempotencyKey);
      const result = await createWebsitePickupOrder({
        locationId,
        idempotencyKey,
        customer: body.customer || {},
        requestedPickupAt: clean(body.requestedPickupAt) || null,
        tipCents: Number(body.tipCents || 0),
        lines: Array.isArray(body.lines) ? body.lines : [],
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201, headers: corsHeaders(auth.origin) });
    }

    const onlineOrderId = clean(body.onlineOrderId);
    if (!onlineOrderId) {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400, headers: corsHeaders(auth.origin) });
    }
    const result = await finalizeWebsitePickupOrder({ locationId, onlineOrderId });
    return NextResponse.json({ ok: true, ...result }, { headers: corsHeaders(auth.origin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Online ordering unavailable.";
    const status = /missing|invalid|required/.test(message) ? 400 : /sold_out|insufficient|paused|unavailable|pickup/.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status, headers: corsHeaders(auth.origin) });
  }
}

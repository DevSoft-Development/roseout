import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { AdminRole } from "@/lib/users/roles";

const ROLES = ["superadmin", "admin", "manager", "marketing_specialist", "marketing_manager"] as const satisfies readonly AdminRole[];
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
const TYPES = new Set(["location", "claim", "event", "experience", "reservation", "postcard", "outing", "plan_text", "campaign"]);

type Destination = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  destination_url: string;
  entity_type: string;
  entity_id: string;
  campaign_id: string | null;
};

function absolute(pathOrUrl: string) {
  try {
    return new URL(pathOrUrl, `${SITE_URL}/`).toString();
  } catch {
    return `${SITE_URL}/`;
  }
}

function cleanSearch(value: string | null) {
  return String(value || "").trim().replace(/[,%()]/g, "").slice(0, 80);
}

function locationName(row: Record<string, unknown>) {
  return String(row.name || row.business_name || row.restaurant_name || row.activity_name || "Location");
}

function locationType(row: Record<string, unknown>) {
  const raw = String(row.location_type || row.type || "restaurant").toLowerCase();
  return raw.includes("activ") ? "activities" : "restaurants";
}

function locationSubtitle(row: Record<string, unknown>) {
  return [row.neighborhood, row.city, row.state].map((value) => String(value || "").trim()).filter(Boolean).join(" · ") || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiRole(ROLES);
  if (auth.error) return auth.error;

  const type = String(req.nextUrl.searchParams.get("type") || "location").toLowerCase();
  if (!TYPES.has(type)) return NextResponse.json({ error: "Unsupported destination type." }, { status: 400 });
  const search = cleanSearch(req.nextUrl.searchParams.get("search"));
  const admin = getSupabaseAdminClient();
  const results: Destination[] = [];

  if (type === "location" || type === "reservation") {
    let query = admin
      .from("locations")
      .select("id,name,business_name,restaurant_name,activity_name,location_type,type,neighborhood,city,state,reservation_enabled,internal_reservations_enabled,uses_internal_reservations,reservation_mode")
      .is("deleted_at", null)
      .eq("is_hidden", false)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (search) query = query.or(`name.ilike.%${search}%,business_name.ilike.%${search}%,restaurant_name.ilike.%${search}%,activity_name.ilike.%${search}%,city.ilike.%${search}%,neighborhood.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to search locations." }, { status: 500 });
    for (const row of data || []) {
      if (type === "reservation" && !(row.reservation_enabled || row.internal_reservations_enabled || row.uses_internal_reservations || row.reservation_mode)) continue;
      const kind = locationType(row as Record<string, unknown>);
      const path = type === "reservation" ? `/locations/${kind}/${row.id}/reserve` : `/locations/${kind}/${row.id}`;
      results.push({ id: row.id, type, title: locationName(row as Record<string, unknown>), subtitle: locationSubtitle(row as Record<string, unknown>), destination_url: absolute(path), entity_type: "location", entity_id: row.id, campaign_id: null });
    }
  }

  if (type === "claim") {
    let query = admin.from("location_claim_codes").select("id,location_id,claim_code,status,created_at").in("status", ["active", "issued", "pending"]).order("created_at", { ascending: false }).limit(40);
    if (search) query = query.ilike("claim_code", `%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to search claim links." }, { status: 500 });
    const locationIds = Array.from(new Set((data || []).map((row) => row.location_id).filter(Boolean)));
    const { data: locations } = locationIds.length ? await admin.from("locations").select("id,name,business_name,restaurant_name,activity_name,neighborhood,city,state").in("id", locationIds) : { data: [] as Record<string, unknown>[] };
    const byId = new Map((locations || []).map((row) => [row.id, row]));
    for (const row of data || []) {
      const location = byId.get(row.location_id) as Record<string, unknown> | undefined;
      results.push({ id: row.id, type, title: location ? locationName(location) : `Claim ${row.claim_code}`, subtitle: location ? locationSubtitle(location) : `Claim code ${row.claim_code}`, destination_url: absolute(`/claim/${encodeURIComponent(row.claim_code)}`), entity_type: "location_claim_code", entity_id: row.id, campaign_id: null });
    }
  }

  if (type === "event") {
    let query = admin.from("events").select("id,slug,title,venue_name,city,state,starts_at,status").eq("searchable", true).in("status", ["scheduled", "postponed"]).gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(40);
    if (search) query = query.or(`title.ilike.%${search}%,venue_name.ilike.%${search}%,city.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to search events." }, { status: 500 });
    for (const row of data || []) results.push({ id: row.id, type, title: row.title, subtitle: [row.venue_name, row.city, row.state].filter(Boolean).join(" · ") || null, destination_url: absolute(`/events/${encodeURIComponent(row.slug || row.id)}`), entity_type: "event", entity_id: row.id, campaign_id: null });
  }

  if (type === "experience") {
    let query = admin.from("experiences").select("id,slug,title,venue_name,city,state,status").eq("searchable", true).eq("status", "published").order("updated_at", { ascending: false }).limit(40);
    if (search) query = query.or(`title.ilike.%${search}%,venue_name.ilike.%${search}%,city.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to search experiences." }, { status: 500 });
    for (const row of data || []) results.push({ id: row.id, type, title: row.title, subtitle: [row.venue_name, row.city, row.state].filter(Boolean).join(" · ") || null, destination_url: absolute(`/experiences/${encodeURIComponent(row.slug || row.id)}`), entity_type: "experience", entity_id: row.id, campaign_id: null });
  }

  if (type === "postcard") {
    let query = admin.from("mailing_batch_items").select("id,location_id,tracking_token,claim_code,status,created_at").not("tracking_token", "is", null).order("created_at", { ascending: false }).limit(40);
    if (search) query = query.or(`claim_code.ilike.%${search}%,status.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to search postcards." }, { status: 500 });
    const locationIds = Array.from(new Set((data || []).map((row) => row.location_id).filter(Boolean)));
    const { data: locations } = locationIds.length ? await admin.from("locations").select("id,name,business_name,restaurant_name,activity_name,neighborhood,city,state").in("id", locationIds) : { data: [] as Record<string, unknown>[] };
    const byId = new Map((locations || []).map((row) => [row.id, row]));
    for (const row of data || []) {
      const location = byId.get(row.location_id) as Record<string, unknown> | undefined;
      results.push({ id: row.id, type, title: location ? locationName(location) : "Claim postcard", subtitle: row.claim_code ? `Claim code ${row.claim_code}` : location ? locationSubtitle(location) : null, destination_url: absolute(`/postcard/claim/${row.tracking_token}`), entity_type: "mailing_batch_item", entity_id: row.id, campaign_id: null });
    }
  }

  if (type === "outing" || type === "plan_text") {
    let query = admin.from("outings").select("id,plan_title,plan_access_token,plan_access_token_expires_at,status,created_at").not("plan_access_token", "is", null).order("created_at", { ascending: false }).limit(40);
    if (search) query = query.ilike("plan_title", `%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to search saved plans." }, { status: 500 });
    for (const row of data || []) {
      if (row.plan_access_token_expires_at && new Date(row.plan_access_token_expires_at).getTime() <= Date.now()) continue;
      results.push({
        id: row.id,
        type,
        title: row.plan_title || "Saved outing",
        subtitle: type === "plan_text" ? `Text-ready plan · ${new Date(row.created_at).toLocaleDateString("en-US")}` : `Created ${new Date(row.created_at).toLocaleDateString("en-US")}`,
        destination_url: absolute(`/outings/guest/${encodeURIComponent(row.plan_access_token)}`),
        entity_type: "outing",
        entity_id: row.id,
        campaign_id: null,
      });
    }
  }

  if (type === "campaign") {
    let query = admin.from("marketing_campaigns").select("id,name,status,public_url,location_id,updated_at").not("public_url", "is", null).order("updated_at", { ascending: false }).limit(40);
    if (search) query = query.or(`name.ilike.%${search}%,status.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to search campaigns." }, { status: 500 });
    for (const row of data || []) {
      if (!row.public_url) continue;
      results.push({ id: row.id, type, title: row.name, subtitle: row.status || null, destination_url: absolute(row.public_url), entity_type: "marketing_campaign", entity_id: row.id, campaign_id: row.id });
    }
  }

  return NextResponse.json({ destinations: results.slice(0, 40) });
}

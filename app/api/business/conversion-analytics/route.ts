import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";

const EXTERNAL = ["external_site_session_started","external_page_view","external_menu_view","external_reserve_click","external_call_click","external_directions_click","external_order_click","external_contact_submit","external_event_view"];

function rangeStart(range: string) {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "12m" ? 365 : range === "all" ? 0 : 30;
  return days ? new Date(Date.now() - days * 86400000).toISOString() : null;
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const locationId = params.get("location_id") || "";
  const range = params.get("range") || "30d";
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const from = rangeStart(range);
  let eventsQuery = supabaseAdmin.from("analytics_events").select("id,event_name,event_type,query,search_id,session_id,metadata,revenue_impact,created_at").eq("location_id", locationId);
  let attributionQuery = supabaseAdmin.from("location_attributions").select("id,search_query,created_at").eq("location_id", locationId);
  if (from) { eventsQuery = eventsQuery.gte("created_at", from); attributionQuery = attributionQuery.gte("created_at", from); }

  const [{ data: events = [] }, { data: attributions = [] }, { data: config }] = await Promise.all([
    eventsQuery,
    attributionQuery,
    supabaseAdmin.from("location_website_tracking").select("verified_at,last_seen_at,average_customer_value,allowed_origins,enabled").eq("location_id", locationId).maybeSingle(),
  ]);

  const name = (event: any) => String(event?.event_name || event?.event_type || event?.metadata?.event_name || "");
  const count = (eventName: string) => (events || []).filter((event: any) => name(event) === eventName).length;
  const externalEvents = (events || []).filter((event: any) => EXTERNAL.includes(name(event)));
  const sessions = new Set(externalEvents.map((event: any) => event.session_id).filter(Boolean)).size || count("external_site_session_started");
  const reservationActions = count("external_reserve_click");
  const highIntentActions = reservationActions + count("external_call_click") + count("external_directions_click") + count("external_order_click") + count("external_contact_submit");
  const averageCustomerValue = Number(config?.average_customer_value || 0);
  const estimatedValue = averageCustomerValue > 0 ? reservationActions * averageCustomerValue : 0;

  const demand = new Map<string, number>();
  for (const event of events || []) {
    const q = String((event as any).query || (event as any).metadata?.search_query || "").trim();
    if (q) demand.set(q, (demand.get(q) || 0) + 1);
  }
  for (const row of attributions || []) {
    const q = String((row as any).search_query || "").trim();
    if (q) demand.set(q, (demand.get(q) || 0) + 1);
  }
  const topDemand = Array.from(demand.entries()).sort((a,b) => b[1]-a[1]).slice(0,8).map(([query, searches]) => ({ query, searches }));

  return NextResponse.json({
    success: true,
    range,
    tracking: {
      connected: Boolean(config?.verified_at),
      enabled: Boolean(config?.enabled),
      verified_at: config?.verified_at || null,
      last_seen_at: config?.last_seen_at || null,
      allowed_origins: config?.allowed_origins || [],
    },
    funnel: {
      attributed_outbound_visits: (attributions || []).length,
      website_sessions: sessions,
      page_views: count("external_page_view"),
      menu_views: count("external_menu_view"),
      high_intent_actions: highIntentActions,
      reservation_actions: reservationActions,
      calls: count("external_call_click"),
      directions: count("external_directions_click"),
      orders: count("external_order_click"),
      contact_submits: count("external_contact_submit"),
    },
    value: {
      average_customer_value: averageCustomerValue || null,
      estimated_customer_value: estimatedValue,
      plan_monthly_cost: 99,
      estimated_plan_multiple: estimatedValue > 0 ? Number((estimatedValue / 99).toFixed(1)) : null,
      label: "Estimated customer value",
    },
    demand: topDemand,
  });
}

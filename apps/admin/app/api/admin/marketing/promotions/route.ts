import { NextResponse } from "next/server";
import { requireMarketingAdminApi, requireMarketingViewerApi } from "@/lib/marketing-admin";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error: authError } = await requireMarketingViewerApi();
  if (authError) return authError;

  const [{ data: campaigns, error }, { data: events }, { data: attributions }, { data: ledger }] = await Promise.all([
    getAdminDatabaseClient().from("promotion_campaigns").select("*").order("created_at", { ascending: false }).limit(500),
    getAdminDatabaseClient().from("promotion_events").select("campaign_id,event_type,amount_cents").order("occurred_at", { ascending: false }).limit(50000),
    getAdminDatabaseClient().from("promotion_attributions").select("campaign_id,conversion_type,attributed_revenue_cents").order("attributed_at", { ascending: false }).limit(50000),
    getAdminDatabaseClient().from("promotion_ledger_entries").select("campaign_id,entry_type,amount_cents").order("created_at", { ascending: false }).limit(50000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const locationIds = [...new Set((campaigns || []).map((row: any) => String(row.location_id)))];
  const { data: locations } = locationIds.length ? await getAdminDatabaseClient().from("locations").select("id,name,restaurant_name,activity_name,city,state").in("id", locationIds) : { data: [] as any[] };
  const locationMap = new Map((locations || []).map((row: any) => [String(row.id), row]));
  const metrics = new Map<string, any>();
  const metricFor = (id: string) => { if (!metrics.has(id)) metrics.set(id, { impressions: 0, engagements: 0, conversions: 0, spend_cents: 0, attributed_revenue_cents: 0, funded_cents: 0, refunded_cents: 0 }); return metrics.get(id); };
  for (const row of events || []) {
    const m = metricFor(String(row.campaign_id));
    if (row.event_type === "impression") m.impressions += 1;
    if (["click","profile_view","outing_open"].includes(row.event_type)) m.engagements += 1;
    if (["reservation_click","call","booking","completed_outing"].includes(row.event_type)) m.conversions += 1;
    m.spend_cents += Number(row.amount_cents || 0);
  }
  for (const row of attributions || []) metricFor(String(row.campaign_id)).attributed_revenue_cents += Number(row.attributed_revenue_cents || 0);
  for (const row of ledger || []) {
    const m = metricFor(String(row.campaign_id));
    if (row.entry_type === "fund") m.funded_cents += Number(row.amount_cents || 0);
    if (row.entry_type === "refund") m.refunded_cents += Math.abs(Number(row.amount_cents || 0));
  }

  const rows = (campaigns || []).map((campaign: any) => {
    const location: any = locationMap.get(String(campaign.location_id));
    return { ...campaign, location_name: location?.name || location?.restaurant_name || location?.activity_name || "Unknown location", location_city: location?.city || null, location_state: location?.state || null, metrics: metricFor(String(campaign.id)) };
  });
  const totals = rows.reduce((acc: any, row: any) => {
    acc.campaigns += 1;
    if (["active","scheduled"].includes(row.status)) acc.live += 1;
    acc.spend_cents += Number(row.metrics.spend_cents || 0);
    acc.impressions += Number(row.metrics.impressions || 0);
    acc.engagements += Number(row.metrics.engagements || 0);
    acc.conversions += Number(row.metrics.conversions || 0);
    acc.attributed_revenue_cents += Number(row.metrics.attributed_revenue_cents || 0);
    acc.refunded_cents += Number(row.metrics.refunded_cents || 0);
    return acc;
  }, { campaigns: 0, live: 0, spend_cents: 0, impressions: 0, engagements: 0, conversions: 0, attributed_revenue_cents: 0, refunded_cents: 0 });
  return NextResponse.json({ campaigns: rows, totals });
}

export async function PATCH(request: Request) {
  const { error: authError } = await requireMarketingAdminApi();
  if (authError) return authError;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim();
  if (!id || !["pause","resume"].includes(action)) return NextResponse.json({ error: "Invalid campaign action." }, { status: 400 });
  const { data: campaign } = await getAdminDatabaseClient().from("promotion_campaigns").select("id,funded_at,starts_at,total_budget_cents,spent_cents").eq("id", id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  let status = "paused";
  if (action === "resume") {
    if (!campaign.funded_at) status = "pending_funding";
    else if (Number(campaign.spent_cents || 0) >= Number(campaign.total_budget_cents || 0)) status = "completed";
    else if (campaign.starts_at && new Date(campaign.starts_at).getTime() > Date.now()) status = "scheduled";
    else status = "active";
  }
  const { error } = await getAdminDatabaseClient().from("promotion_campaigns").update({ status, paused_at: status === "paused" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, status });
}

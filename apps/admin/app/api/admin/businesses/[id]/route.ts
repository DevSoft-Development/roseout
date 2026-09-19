import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCATION_FIELDS = "id,name,restaurant_name,activity_name,address,city,state,zip_code,phone,website,category,cuisine,rating,google_place_id,source_table,source_id,intent_tags,reservation_url,reservation_link,external_reservation_url,location_type,updated_at" as const;
const CRM_FIELDS = "id,location_id,location_name,name,city,borough,state,zip_code,zip,address,phone,website,category,cuisine,description,status,is_searchable,is_claimed,reservation_url,external_reservation_url,location_type,crm_status,opportunity_score,upgrade_probability,engagement_score,traffic_score,conversion_score,retention_score,churn_risk_score,trending_score,profile_views_30d,search_appearances_30d,saves_30d,reservation_completions_30d,conversion_rate_30d,follow_up_date,outreach_status,last_contacted_at,outreach_notes,retention_recommendation,priority_level,created_at,updated_at" as const;
const EDITABLE_FIELDS = ["name", "phone", "website", "category", "cuisine", "reservation_url", "reservation_link"] as const;

function boundedText(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrm);
  if (auth.error) return auth.error;
  const { id } = await params;
  const [loc, crm] = await Promise.all([
    supabaseAdmin.from("locations").select(LOCATION_FIELDS).eq("id", id).maybeSingle(),
    supabaseAdmin.from("business_crm_snapshot").select(CRM_FIELDS).eq("id", id).maybeSingle(),
  ]);
  if (loc.error) return NextResponse.json({ error: loc.error.message }, { status: 500 });
  if (crm.error) return NextResponse.json({ error: crm.error.message }, { status: 500 });
  return NextResponse.json({ location: loc.data || null, crm: crm.data || null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.businessCrm);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    const max = key === "name" ? 180 : key === "phone" ? 60 : key === "category" || key === "cuisine" ? 120 : 2000;
    updates[key] = boundedText(body[key], max);
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No supported fields to update." }, { status: 400 });
  }

  const { data, error: updateError } = await supabaseAdmin
    .from("locations")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(LOCATION_FIELDS)
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ location: data });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeCampaignStatus,
  normalizeCampaignType,
  normalizeString,
  normalizeStringArray,
  normalizeStringOrNull,
  nowIso,
  requireMarketingAdminApi,
  requireMarketingViewerApi,
} from "@/lib/marketing-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { error } = await requireMarketingViewerApi();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabaseAdmin
    .from("marketing_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && status !== "all") query = query.eq("status", status);

  const { data, error: fetchError } = await query;
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data || [] });
}

export async function POST(req: Request) {
  const { error, adminUser } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const name = normalizeString(body.name, "Untitled Campaign");
  const campaignType = normalizeCampaignType(body.campaign_type);
  const status = normalizeCampaignStatus(body.status);

  const payload = {
    name,
    campaign_type: campaignType,
    status: status === "sent" ? "draft" : status,
    selected_platforms: normalizeStringArray(body.selected_platforms),
    audience_segment: normalizeStringOrNull(body.audience_segment),
    audience_id: normalizeStringOrNull(body.audience_id),
    location_id: normalizeStringOrNull(body.location_id),
    location_source_type: normalizeStringOrNull(body.location_source_type),
    location_source_id: normalizeStringOrNull(body.location_source_id),
    location_name: normalizeStringOrNull(body.location_name),
    location_image_url: normalizeStringOrNull(body.location_image_url),
    location_category: normalizeStringOrNull(body.location_category),
    location_city: normalizeStringOrNull(body.location_city),
    location_state: normalizeStringOrNull(body.location_state),
    location_address: normalizeStringOrNull(body.location_address),
    location_description: normalizeStringOrNull(body.location_description),
    public_location_url: normalizeStringOrNull(body.public_location_url),
    social_captions: typeof body.social_captions === "object" && body.social_captions ? body.social_captions : {},
    generated_prompt: normalizeStringOrNull(body.generated_prompt),
    generated_payload: typeof body.generated_payload === "object" && body.generated_payload ? body.generated_payload : {},
    hashtags: normalizeStringArray(body.hashtags),
    email_subject: normalizeStringOrNull(body.email_subject),
    email_body: normalizeStringOrNull(body.email_body),
    sms_text: normalizeStringOrNull(body.sms_text),
    image_url: normalizeStringOrNull(body.image_url),
    video_url: normalizeStringOrNull(body.video_url),
    cta_url: normalizeStringOrNull(body.cta_url),
    scheduled_at: normalizeStringOrNull(body.scheduled_at),
    created_by: adminUser?.id || null,
    created_by_email: adminUser?.email || null,
    updated_at: nowIso(),
  };

  const { data, error: insertError } = await supabaseAdmin
    .from("marketing_campaigns")
    .insert(payload)
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ campaign: data }, { status: 201 });
}

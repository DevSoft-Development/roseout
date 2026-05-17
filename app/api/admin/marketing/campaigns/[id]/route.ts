import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeCampaignStatus,
  normalizeCampaignType,
  normalizeStringArray,
  normalizeStringOrNull,
  nowIso,
  requireMarketingAdminApi,
  requireMarketingViewerApi,
} from "@/lib/marketing-admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { error } = await requireMarketingViewerApi();
  if (error) return error;

  const { id } = await context.params;
  const { data, error: fetchError } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("*, marketing_messages(*), social_posts(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  return NextResponse.json({ campaign: data });
}

export async function PATCH(req: Request, context: RouteContext) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const { id } = await context.params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: nowIso() };

  if ("name" in body) updates.name = normalizeStringOrNull(body.name) || "Untitled Campaign";
  if ("campaign_type" in body) updates.campaign_type = normalizeCampaignType(body.campaign_type);
  if ("status" in body) updates.status = normalizeCampaignStatus(body.status) === "sent" ? "draft" : normalizeCampaignStatus(body.status);
  if ("selected_platforms" in body) updates.selected_platforms = normalizeStringArray(body.selected_platforms);
  if ("audience_segment" in body) updates.audience_segment = normalizeStringOrNull(body.audience_segment);
  if ("audience_id" in body) updates.audience_id = normalizeStringOrNull(body.audience_id);
  if ("social_captions" in body) updates.social_captions = typeof body.social_captions === "object" && body.social_captions ? body.social_captions : {};
  if ("hashtags" in body) updates.hashtags = normalizeStringArray(body.hashtags);
  if ("email_subject" in body) updates.email_subject = normalizeStringOrNull(body.email_subject);
  if ("email_body" in body) updates.email_body = normalizeStringOrNull(body.email_body);
  if ("sms_text" in body) updates.sms_text = normalizeStringOrNull(body.sms_text);
  if ("image_url" in body) updates.image_url = normalizeStringOrNull(body.image_url);
  if ("video_url" in body) updates.video_url = normalizeStringOrNull(body.video_url);
  if ("cta_url" in body) updates.cta_url = normalizeStringOrNull(body.cta_url);
  if ("scheduled_at" in body) updates.scheduled_at = normalizeStringOrNull(body.scheduled_at);

  const { data, error: updateError } = await supabaseAdmin
    .from("marketing_campaigns")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  return NextResponse.json({ campaign: data });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const { id } = await context.params;
  const { error: deleteError } = await supabaseAdmin.from("marketing_campaigns").delete().eq("id", id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

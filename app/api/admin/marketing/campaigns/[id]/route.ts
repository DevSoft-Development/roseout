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
import { buildCampaignSlug, campaignPublicUrl, getUniqueCampaignSlug } from "@/lib/marketing-public";

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
  if ("generated_prompt" in body) updates.generated_prompt = normalizeStringOrNull(body.generated_prompt);
  if ("generated_payload" in body) updates.generated_payload = typeof body.generated_payload === "object" && body.generated_payload ? body.generated_payload : {};
  if ("location_id" in body) updates.location_id = normalizeStringOrNull(body.location_id);
  if ("location_source_type" in body) updates.location_source_type = normalizeStringOrNull(body.location_source_type);
  if ("location_source_id" in body) updates.location_source_id = normalizeStringOrNull(body.location_source_id);
  if ("location_name" in body) updates.location_name = normalizeStringOrNull(body.location_name);
  if ("location_image_url" in body) updates.location_image_url = normalizeStringOrNull(body.location_image_url);
  if ("location_category" in body) updates.location_category = normalizeStringOrNull(body.location_category);
  if ("location_city" in body) updates.location_city = normalizeStringOrNull(body.location_city);
  if ("location_state" in body) updates.location_state = normalizeStringOrNull(body.location_state);
  if ("location_address" in body) updates.location_address = normalizeStringOrNull(body.location_address);
  if ("location_description" in body) updates.location_description = normalizeStringOrNull(body.location_description);
  if ("public_location_url" in body) updates.public_location_url = normalizeStringOrNull(body.public_location_url);
  if ("hashtags" in body) updates.hashtags = normalizeStringArray(body.hashtags);
  if ("email_subject" in body) updates.email_subject = normalizeStringOrNull(body.email_subject);
  if ("email_body" in body) updates.email_body = normalizeStringOrNull(body.email_body);
  if ("sms_text" in body) updates.sms_text = normalizeStringOrNull(body.sms_text);
  if ("image_url" in body) updates.image_url = normalizeStringOrNull(body.image_url);
  if ("video_url" in body) updates.video_url = normalizeStringOrNull(body.video_url);
  if ("cta_url" in body) updates.cta_url = normalizeStringOrNull(body.cta_url);
  if ("scheduled_at" in body) updates.scheduled_at = normalizeStringOrNull(body.scheduled_at);
  if ("source_platform" in body) updates.source_platform = normalizeStringOrNull(body.source_platform);
  if ("caption_category" in body) updates.caption_category = normalizeStringOrNull(body.caption_category);
  if ("public_slug" in body) {
    const publicSlug = await getUniqueCampaignSlug(normalizeStringOrNull(body.public_slug) || buildCampaignSlug({ name: normalizeStringOrNull(body.name), locationName: normalizeStringOrNull(body.location_name), captionCategory: normalizeStringOrNull(body.caption_category) || normalizeStringOrNull(body.location_category), city: normalizeStringOrNull(body.location_city) }), id);
    updates.public_slug = publicSlug;
    updates.public_url = campaignPublicUrl(publicSlug);
  }

  const needsPublicSlug = "name" in body || "location_name" in body || "location_category" in body || "location_city" in body || "caption_category" in body;
  if (needsPublicSlug) {
    const { data: existing } = await supabaseAdmin.from("marketing_campaigns").select("public_slug").eq("id", id).maybeSingle();
    if (!existing?.public_slug) {
      const publicSlug = await getUniqueCampaignSlug(buildCampaignSlug({ name: normalizeStringOrNull(body.name), locationName: normalizeStringOrNull(body.location_name), captionCategory: normalizeStringOrNull(body.caption_category) || normalizeStringOrNull(body.location_category), city: normalizeStringOrNull(body.location_city) }), id);
      updates.public_slug = publicSlug;
      updates.public_url = campaignPublicUrl(publicSlug);
    }
  }

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

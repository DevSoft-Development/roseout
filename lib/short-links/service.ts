import type { SupabaseClient } from "@supabase/supabase-js";
import { allocateShortCode, buildShortLinkUrl, normalizeShortCode, normalizeShortLinkDestination } from "@/lib/outings/short-links";

type EnsureShortLinkInput = {
  destinationUrl: string;
  linkType: string;
  entityType?: string | null;
  entityId?: string | null;
  campaignId?: string | null;
  title?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
  preferredCode?: string | null;
  forceNew?: boolean;
};

type ShortLinkResult = {
  id: string;
  code: string;
  shortUrl: string;
  destinationUrl: string;
  reused: boolean;
};

const clean = (value: string | null | undefined, max = 255) => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

export async function ensureShortLink(admin: SupabaseClient, input: EnsureShortLinkInput): Promise<ShortLinkResult> {
  const destinationUrl = normalizeShortLinkDestination(input.destinationUrl);
  if (!destinationUrl) throw new Error("A valid short-link destination is required.");

  const linkType = clean(input.linkType, 64) || "generic";
  const entityType = clean(input.entityType, 64);
  const entityId = clean(input.entityId, 255);
  const campaignId = clean(input.campaignId, 64);
  const title = clean(input.title, 255);

  if (!input.forceNew && entityType && entityId) {
    let query = admin
      .from("short_links")
      .select("id,code,destination_url")
      .eq("link_type", linkType)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .contains("metadata", { system_managed: true })
      .order("updated_at", { ascending: false })
      .limit(1);

    query = campaignId ? query.eq("campaign_id", campaignId) : query.is("campaign_id", null);
    const { data: existing, error: existingError } = await query.maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      if (existing.destination_url !== destinationUrl || title) {
        const { error: updateError } = await admin
          .from("short_links")
          .update({
            destination_url: destinationUrl,
            ...(title ? { title } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      }
      return {
        id: existing.id,
        code: existing.code,
        shortUrl: buildShortLinkUrl(existing.code),
        destinationUrl,
        reused: true,
      };
    }
  }

  const preferredCode = normalizeShortCode(input.preferredCode);
  const code = preferredCode || await allocateShortCode(admin);
  const metadata = {
    ...(input.metadata || {}),
    system_managed: true,
    source: "short_link_service",
  };

  const { data, error } = await admin
    .from("short_links")
    .insert({
      code,
      destination_url: destinationUrl,
      link_type: linkType,
      entity_type: entityType,
      entity_id: entityId,
      campaign_id: campaignId,
      title,
      created_by: clean(input.createdBy, 255),
      metadata,
      is_active: true,
    })
    .select("id,code,destination_url")
    .single();

  if (error) throw error;
  return {
    id: data.id,
    code: data.code,
    shortUrl: buildShortLinkUrl(data.code),
    destinationUrl: data.destination_url,
    reused: false,
  };
}

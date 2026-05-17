import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PublicCampaign } from "@/lib/marketing-public";

export type NormalizedCampaignLocation = {
  id: string;
  sourceTable: string;
  sourceId: string;
  name: string;
  type: "restaurant" | "activity";
  imageUrl: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  description: string | null;
  publicUrl: string | null;
  primaryCategory?: string | null;
  locationType?: string | null;
};

type LocationRecord = Record<string, unknown>;

const LOCATION_SELECT = `
  id,
  source_table,
  source_id,
  location_type,
  restaurant_name,
  activity_name,
  name,
  business_name,
  address,
  city,
  state,
  zip_code,
  latitude,
  longitude,
  description,
  primary_category,
  cuisine,
  cuisine_type,
  food_type,
  activity_type,
  primary_tag,
  tags,
  google_types,
  atmosphere,
  price_range,
  external_reservation_url,
  reservation_url,
  reservation_link,
  reservation_enabled,
  booking_url,
  website,
  google_maps_url,
  main_image,
  image_url,
  images,
  rating,
  review_count,
  theouthaven_score,
  review_keywords,
  is_searchable,
  data_status,
  is_hidden,
  status
`;

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function imageValue(record: LocationRecord) {
  const mainImage = stringValue(record.main_image);
  if (mainImage) return mainImage;
  const imageUrl = stringValue(record.image_url);
  if (imageUrl) return imageUrl;
  const images = record.images;
  if (Array.isArray(images) && typeof images[0] === "string") return images[0];
  if (typeof images === "string") return images.split(",")[0]?.trim() || null;
  return null;
}

export function inferCampaignLocationType(input: Partial<PublicCampaign> | LocationRecord): "restaurant" | "activity" {
  const values = [
    "primary_category" in input ? input.primary_category : null,
    "source_table" in input ? input.source_table : null,
    "location_source_table" in input ? input.location_source_table : null,
    "location_source_type" in input ? input.location_source_type : null,
    "location_type" in input ? input.location_type : null,
    "category" in input ? input.category : null,
    "location_category" in input ? input.location_category : null,
    "caption_category" in input ? input.caption_category : null,
  ]
    .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
    .join(" ");

  if ("activity_name" in input && stringValue(input.activity_name)) return "activity";
  if ("restaurant_name" in input && stringValue(input.restaurant_name)) return "restaurant";
  if (/activit|experience|bowling|arcade|karaoke|museum|escape|golf|comedy|movie|spa|game|billiard|music|paint/.test(values)) return "activity";
  if (/restaurant|dining|dinner|brunch|lunch|breakfast|food|cuisine|steak|sushi|pizza|cafe|bar|lounge/.test(values)) return "restaurant";
  return values.includes("activities") ? "activity" : "restaurant";
}

export function normalizeCampaignLocation(record: LocationRecord, campaign?: PublicCampaign | null): NormalizedCampaignLocation {
  const type = inferCampaignLocationType(record);
  const id = stringValue(record.id) || stringValue(campaign?.location_source_id) || stringValue(campaign?.id) || "";
  const sourceTable = stringValue(record.source_table) || stringValue(campaign?.location_source_type) || (type === "activity" ? "activities" : "restaurants");
  const sourceId = stringValue(record.source_id) || stringValue(campaign?.location_source_id) || id;
  const name =
    stringValue(record.restaurant_name) ||
    stringValue(record.activity_name) ||
    stringValue(record.name) ||
    stringValue(record.business_name) ||
    stringValue(campaign?.location_name) ||
    "TheOutHaven spot";

  return {
    ...record,
    id,
    sourceTable,
    sourceId,
    name,
    type,
    imageUrl: imageValue(record) || campaign?.location_image_url || null,
    city: stringValue(record.city) || campaign?.location_city || null,
    state: stringValue(record.state) || campaign?.location_state || null,
    address: stringValue(record.address) || campaign?.location_address || null,
    description: stringValue(record.description) || campaign?.location_description || null,
    publicUrl: campaign?.public_location_url || null,
    primaryCategory: stringValue(record.primary_category) || campaign?.location_category || campaign?.caption_category || null,
    locationType: stringValue(record.location_type) || type,
  };
}

export function normalizeCampaignFallback(campaign: PublicCampaign): NormalizedCampaignLocation | null {
  const id = campaign.location_source_id || campaign.id;
  if (!id && !campaign.location_name) return null;
  const type = inferCampaignLocationType(campaign);
  return {
    id,
    sourceTable: campaign.location_source_type || (type === "activity" ? "activities" : "restaurants"),
    sourceId: campaign.location_source_id || id,
    name: campaign.location_name || campaign.name || "TheOutHaven spot",
    type,
    imageUrl: campaign.location_image_url || null,
    city: campaign.location_city || null,
    state: campaign.location_state || null,
    address: campaign.location_address || null,
    description: campaign.location_description || null,
    publicUrl: campaign.public_location_url || null,
    primaryCategory: campaign.location_category || campaign.caption_category || null,
    locationType: type,
  };
}

export async function resolveCampaignLocation(campaign: PublicCampaign): Promise<NormalizedCampaignLocation | null> {
  const sourceId = campaign.location_source_id;
  const sourceTable = campaign.location_source_type;

  if (sourceId) {
    const byLocationId = await supabaseAdmin
      .from("locations")
      .select(LOCATION_SELECT)
      .or(`id.eq.${sourceId},source_id.eq.${sourceId}`)
      .maybeSingle();

    if (byLocationId.data && !byLocationId.error) {
      return normalizeCampaignLocation(byLocationId.data as LocationRecord, campaign);
    }

    if (sourceTable === "restaurants" || sourceTable === "activities") {
      const { data } = await supabaseAdmin
        .from(sourceTable)
        .select("*")
        .eq("id", sourceId)
        .maybeSingle();

      if (data) {
        return normalizeCampaignLocation({ ...(data as LocationRecord), source_table: sourceTable, source_id: sourceId }, campaign);
      }
    }
  }

  if (campaign.location_name) {
    let query = supabaseAdmin.from("locations").select(LOCATION_SELECT).ilike("name", campaign.location_name);
    if (campaign.location_city) query = query.ilike("city", campaign.location_city);
    const { data } = await query.limit(1).maybeSingle();
    if (data) return normalizeCampaignLocation(data as LocationRecord, campaign);
  }

  const fallback = normalizeCampaignFallback(campaign);
  if (fallback && sourceTable) fallback.sourceTable = sourceTable;
  return fallback;
}

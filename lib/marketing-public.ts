import "server-only";

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type PublicCampaign = {
  id: string;
  name: string | null;
  campaign_type: string | null;
  status: string | null;
  selected_platforms?: string[] | null;
  location_source_type?: string | null;
  location_source_id?: string | null;
  location_name?: string | null;
  location_image_url?: string | null;
  location_category?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_address?: string | null;
  location_description?: string | null;
  public_location_url?: string | null;
  public_slug?: string | null;
  public_url?: string | null;
  source_platform?: string | null;
  caption_category?: string | null;
  social_captions?: Record<string, string> | null;
  hashtags?: string[] | null;
  generated_payload?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FeaturedLocation = {
  id: string;
  source_table?: string | null;
  source_id?: string | null;
  slug?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  business_name?: string | null;
  primary_category?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | string | null;
  location_type?: string | null;
};

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
}

export function slugifyCampaign(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "theouthaven-campaign";
}

export function buildCampaignSlug(input: {
  name?: string | null;
  locationName?: string | null;
  captionCategory?: string | null;
  city?: string | null;
}) {
  return slugifyCampaign([input.locationName, input.captionCategory, input.city].filter(Boolean).join(" ") || input.name || "theouthaven-campaign");
}

export function campaignPublicUrl(slug: string) {
  return `${siteUrl()}/go/${slug}`;
}

export async function getUniqueCampaignSlug(baseSlug: string, existingCampaignId?: string) {
  const base = slugifyCampaign(baseSlug);
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    let query = supabaseAdmin.from("marketing_campaigns").select("id").eq("public_slug", candidate).limit(1);
    if (existingCampaignId) query = query.neq("id", existingCampaignId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function campaignTitle(campaign: PublicCampaign) {
  return campaign.name || campaign.location_name || "TheOutHaven featured plan";
}

export function campaignImage(campaign: PublicCampaign) {
  return campaign.location_image_url || "/placeholder.jpg";
}

export function campaignPlace(campaign: PublicCampaign) {
  return [campaign.location_city, campaign.location_state].filter(Boolean).join(", ");
}

export function campaignCaption(campaign: PublicCampaign) {
  const captions = campaign.social_captions || {};
  const generated = campaign.generated_payload || {};
  return captions.instagram || captions.tiktok || (typeof generated.instagram_caption === "string" ? generated.instagram_caption : "") || campaign.location_category || "Social pick";
}

export function locationName(location: FeaturedLocation) {
  return location.name || location.restaurant_name || location.activity_name || location.business_name || "TheOutHaven spot";
}

export function locationCategory(location: FeaturedLocation) {
  return location.primary_category || location.cuisine_type || location.activity_type || location.location_type || "Featured spot";
}

export function locationImage(location: FeaturedLocation) {
  if (location.main_image) return location.main_image;
  if (location.image_url) return location.image_url;
  if (Array.isArray(location.images) && location.images[0]) return location.images[0];
  if (typeof location.images === "string" && location.images) return location.images.split(",")[0]?.trim() || "/placeholder.jpg";
  return "/placeholder.jpg";
}

export function locationHref(location: FeaturedLocation) {
  const type = location.source_table === "activities" || location.location_type === "activity" ? "activities" : "restaurants";
  return `/locations/${type}/${location.slug || location.source_id || location.id}`;
}

export async function loadActiveBioSlug() {
  const { data } = await supabaseAdmin
    .from("marketing_settings")
    .select("value")
    .eq("key", "active_bio_campaign_slug")
    .maybeSingle();

  const value = data?.value;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "slug" in value && typeof value.slug === "string") return value.slug;
  return "";
}

export async function loadPublicCampaigns(limit = 12) {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,name,campaign_type,status,selected_platforms,location_source_type,location_source_id,location_name,location_image_url,location_category,location_city,location_state,location_address,location_description,public_location_url,public_slug,public_url,source_platform,caption_category,social_captions,hashtags,generated_payload,created_at,updated_at")
    .not("public_slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data || []) as PublicCampaign[];
}

export async function loadCampaignBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,name,campaign_type,status,selected_platforms,location_source_type,location_source_id,location_name,location_image_url,location_category,location_city,location_state,location_address,location_description,public_location_url,public_slug,public_url,source_platform,caption_category,social_captions,hashtags,generated_payload,created_at,updated_at")
    .eq("public_slug", slug)
    .maybeSingle();

  if (error) return null;
  return data as PublicCampaign | null;
}

export async function loadFeaturedLocations(limit = 8, city?: string | null, state?: string | null) {
  let query = supabaseAdmin
    .from("locations")
    .select("id,source_table,source_id,slug,name,restaurant_name,activity_name,business_name,primary_category,cuisine_type,activity_type,city,state,description,main_image,image_url,images,location_type")
    .limit(limit);

  if (city) query = query.ilike("city", city);
  if (state) query = query.ilike("state", state);

  const { data, error } = await query;
  if (error) return [];
  return (data || []) as FeaturedLocation[];
}

export async function trackCampaignClick(campaign: PublicCampaign | null, slug: string, utmSource?: string) {
  const headerList = await headers();
  await supabaseAdmin.from("marketing_link_clicks").insert({
    campaign_id: campaign?.id || null,
    slug,
    referrer: headerList.get("referer"),
    user_agent: headerList.get("user-agent"),
    utm_source: utmSource || null,
  });
}

import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type PromotionPlacement = "discover" | "search";

export type PromotionCampaign = {
  id: string;
  location_id: string;
  name: string;
  promotion_type: "location" | "outing" | "event" | "experience";
  placements: string[];
  status: string;
  audience_mode: "auto" | "manual";
  targeting: Record<string, unknown> | null;
  creative: Record<string, unknown> | null;
  total_budget_cents: number;
  daily_budget_cents: number | null;
  spent_cents: number;
  discover_cpm_cents: number;
  search_cpc_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  metadata: Record<string, unknown> | null;
};

function activeNow(campaign: PromotionCampaign, now = Date.now()) {
  if (campaign.status !== "active") return false;
  if (campaign.total_budget_cents <= campaign.spent_cents) return false;
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) return false;
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < now) return false;
  return true;
}

async function spentToday(campaignId: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin
    .from("promotion_ledger_entries")
    .select("amount_cents")
    .eq("campaign_id", campaignId)
    .eq("entry_type", "spend")
    .gte("created_at", start.toISOString());
  return (data || []).reduce((sum, row: any) => sum + Math.max(0, Number(row.amount_cents || 0)), 0);
}

export async function getDeliverablePromotionCampaigns(placement: PromotionPlacement) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("promotion_campaigns")
    .select("id,location_id,name,promotion_type,placements,status,audience_mode,targeting,creative,total_budget_cents,daily_budget_cents,spent_cents,discover_cpm_cents,search_cpc_cents,starts_at,ends_at,metadata")
    .eq("status", "active")
    .contains("placements", [placement])
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("PROMOTION_CAMPAIGNS_LOAD_ERROR", error.message);
    return [] as PromotionCampaign[];
  }

  const campaigns = (data || []).filter((row: any) => activeNow(row as PromotionCampaign)) as PromotionCampaign[];
  const eligible: PromotionCampaign[] = [];
  for (const campaign of campaigns) {
    if (campaign.daily_budget_cents) {
      const today = await spentToday(campaign.id);
      if (today >= campaign.daily_budget_cents) continue;
    }
    eligible.push(campaign);
  }
  return eligible;
}

function idOf(value: any) {
  return value?.id == null ? null : String(value.id);
}

function campaignForLocation(campaigns: PromotionCampaign[], value: any) {
  const id = idOf(value);
  return id ? campaigns.find((campaign) => campaign.location_id === id) || null : null;
}

function sponsoredFields(campaign: PromotionCampaign) {
  return {
    sponsored: true,
    isSponsored: true,
    is_sponsored: true,
    placement_type: "sponsored",
    sponsor_id: campaign.id,
    promotion_campaign_id: campaign.id,
  };
}

function moveSponsoredAfterBest<T extends Record<string, any>>(items: T[]) {
  const organic = items.filter((item) => !item.sponsored);
  const sponsored = items.filter((item) => item.sponsored);
  if (!sponsored.length) return items;
  if (!organic.length) return sponsored;
  return [organic[0], ...sponsored.slice(0, 1), ...organic.slice(1), ...sponsored.slice(1)];
}

export async function applySearchPromotions<T extends Record<string, any>>(payload: T): Promise<T> {
  const campaigns = await getDeliverablePromotionCampaigns("search");
  if (!campaigns.length) return payload;

  const root: any = payload?.searchV2 && typeof payload.searchV2 === "object" ? payload.searchV2 : payload;
  if (!root || typeof root !== "object") return payload;

  const annotateLocation = (location: any) => {
    if (!location || typeof location !== "object") return location;
    const campaign = campaignForLocation(campaigns, location);
    return campaign ? { ...location, ...sponsoredFields(campaign) } : location;
  };

  if (Array.isArray(root.restaurants)) root.restaurants = moveSponsoredAfterBest(root.restaurants.map(annotateLocation));
  if (Array.isArray(root.activities)) root.activities = moveSponsoredAfterBest(root.activities.map(annotateLocation));
  if (Array.isArray(root.sameVenueResults)) root.sameVenueResults = moveSponsoredAfterBest(root.sameVenueResults.map(annotateLocation));
  if (Array.isArray(root.same_venue_results)) root.same_venue_results = moveSponsoredAfterBest(root.same_venue_results.map(annotateLocation));

  if (Array.isArray(root.pairs)) {
    const pairs = root.pairs.map((pair: any) => {
      const restaurantCampaign = campaignForLocation(campaigns, pair?.restaurant);
      const activityCampaign = campaignForLocation(campaigns, pair?.activity);
      const campaign = restaurantCampaign || activityCampaign;
      if (!campaign) return pair;
      return {
        ...pair,
        restaurant: annotateLocation(pair.restaurant),
        activity: annotateLocation(pair.activity),
        ...sponsoredFields(campaign),
      };
    });
    root.pairs = moveSponsoredAfterBest(pairs);
  }

  if (payload?.searchV2 && root !== payload) return { ...payload, searchV2: root } as T;
  return root as T;
}

export async function loadDiscoverPromotionItems() {
  const campaigns = await getDeliverablePromotionCampaigns("discover");
  if (!campaigns.length) return [];
  const ids = [...new Set(campaigns.map((campaign) => campaign.location_id))];
  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,city,state,primary_category,cuisine,cuisine_type,activity_type,hero_image_url,cover_image_url,photo_url,image_url,source_table,location_type")
    .in("id", ids)
    .eq("publish_ready", true)
    .eq("is_searchable", true);
  const byId = new Map((locations || []).map((row: any) => [String(row.id), row]));

  return campaigns.flatMap((campaign) => {
    const location: any = byId.get(campaign.location_id);
    if (!location) return [];
    const creative = campaign.creative || {};
    const title = String(creative.headline || location.name || location.restaurant_name || location.activity_name || campaign.name);
    const subtitle = String(creative.description || [location.primary_category || location.cuisine || location.cuisine_type || location.activity_type, location.city, location.state].filter(Boolean).join(" · ")) || null;
    const image = String(creative.image_url || location.hero_image_url || location.cover_image_url || location.photo_url || location.image_url || "") || null;
    const type = String(location.location_type || location.source_table || "location").toLowerCase().includes("activ") ? "activity" : "restaurant";
    return [{
      id: `promotion-${campaign.id}`,
      section_id: campaign.promotion_type === "outing" ? "featured-outings" : "featured-places",
      title,
      subtitle,
      image_url: image,
      href: `/locations/${type}/${encodeURIComponent(campaign.location_id)}?promo=${encodeURIComponent(campaign.id)}`,
      query: null,
      badge: campaign.promotion_type === "outing" ? "Featured OUTing" : "Featured Place",
      location_id: campaign.location_id,
      sponsored: true,
      sponsor_label: "Sponsored",
      enabled: true,
      sort_order: -100,
      starts_at: campaign.starts_at,
      ends_at: campaign.ends_at,
      metadata: { campaign_id: campaign.id, source: "promotion_campaign", placement: "discover" },
    }];
  });
}
